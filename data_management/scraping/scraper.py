"""
scraper.py — Selenium-based SPIRE class search scraper.

Navigates UMass SPIRE via a real Chrome session, iterates every subject for
the requested term(s), and writes results as JSON Lines to out/.

Output files:
    out/courses.json   — one unique course per line: {course_number, subject, number, name}
    out/sections.json  — one term entry per line:    {course_number, semester, instructors:[...]}
    out/session.json   — scrape progress tracker; enables resume after interruption

Usage:
    pip install -r requirements.txt
    python scraper.py                               # most recent term, all subjects
    python scraper.py --term "Spring 2025"          # specific term, all subjects
    python scraper.py --subject COMPSCI             # one subject only (good for testing)
    python scraper.py --years 4                     # all terms from the last 4 years
    python scraper.py --all-terms                   # every term in the SPIRE dropdown
    python scraper.py --force                       # ignore session, re-scrape everything
    python scraper.py --probe-units                 # DOM probe: find the units element ID
    python scraper.py --probe-units --subject MATH  # probe a different subject

Resume / Ctrl-C:
    Progress is saved after every subject. If interrupted, re-run the same command to resume.
    Ctrl-C finishes the current subject, saves, then exits. Ctrl-C twice force-quits.
    To manually mark terms as done: edit out/session.json directly (see USAGE.txt).

"""

import argparse
import datetime
import json
import os
import re
import signal
import sys
from time import sleep

from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.wait import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager
import logging

SPIRE_URL = "https://www.spire.umass.edu"
OUT_DIR = os.path.join(os.path.dirname(__file__), "out")
HEADLESS = True

# TIMEOUT = 120  # seconds — SPIRE is slow
# TIMEOUT = 60  
TIMEOUT = 15  

logger = logging.getLogger(__name__)


def setup_logging(debug: bool = False):
    """Configure logging for the scraper utilities.

    Call with `debug=True` to enable verbose debug output suitable for
    troubleshooting stalls and DOM issues.
    """
    level = logging.DEBUG if debug else logging.INFO
    # Prefer not to reconfigure if the root logger already has handlers
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    else:
        root.setLevel(level)

    # Reduce noise from libraries we don't need verbose output from
    logging.getLogger("selenium").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("webdriver_manager").setLevel(logging.WARNING)

    logger.debug("Logging initialized at %s", logging.getLevelName(level))

# ---------------------------------------------------------------------------
# Driver setup
# ---------------------------------------------------------------------------

def make_driver() -> webdriver.Chrome:
    opts = webdriver.ChromeOptions()
    
    if HEADLESS:
        opts.add_argument("--headless")
        
    opts.add_argument("--no-sandbox")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument("--disable-dev-shm-usage")
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=opts)


# ---------------------------------------------------------------------------
# SPIRE wait / navigation helpers (adapted from spire-api reference)
# ---------------------------------------------------------------------------


def wait_for_spire(driver: webdriver.Chrome):
    """Wait until SPIRE's loading overlay is gone."""
    # Log what the body style looks like before we start waiting
    try:
        body = driver.find_element(By.CSS_SELECTOR, "body.PSPAGE")
        style = body.get_attribute("style") or ""
        print(f"        wait_for_spire: body.PSPAGE style={style!r}", flush=True)
    except NoSuchElementException:
        print(f"        wait_for_spire: body.PSPAGE not found — returning immediately", flush=True)
        return
    WebDriverWait(driver, TIMEOUT).until_not(
        EC.text_to_be_present_in_element_attribute(
            (By.CSS_SELECTOR, "body.PSPAGE"), "style", "none"
        )
    )
    print(f"        wait_for_spire: done", flush=True)


def switch_to_iframe(driver: webdriver.Chrome):
    logger.debug("switch_to_iframe: waiting for iframe 'TargetContent'")
    WebDriverWait(driver, TIMEOUT).until(
        EC.frame_to_be_available_and_switch_to_it((By.NAME, "TargetContent"))
    )
    logger.debug("switch_to_iframe: switched to iframe 'TargetContent'")


def ensure_iframe(driver: webdriver.Chrome):
    """Switch (back) into the TargetContent iframe.

    Always resets to default content first. This is the critical fix:
    without default_content(), calling switch_to_iframe while already inside
    the iframe causes Selenium to search for a *nested* frame named
    'TargetContent' (which doesn't exist). That triggers a 120-second
    WebDriverWait timeout on every single select_by_value / click_and_wait
    call — making the scraper appear permanently stalled.
    """
    try:
        logger.debug("ensure_iframe: resetting to default content then switching to iframe")
        print("        ensure_iframe: reset to default_content, then switching into iframe...", flush=True)
        driver.switch_to.default_content()
        switch_to_iframe(driver)
        print("        ensure_iframe: done", flush=True)
    except TimeoutException:
        print("        ensure_iframe: TIMEOUT — iframe not found after reset", flush=True)
        logger.debug("ensure_iframe: iframe switch timed out; continuing")


def click_and_wait(driver: webdriver.Chrome, element_id: str):
    # Ensure we're inside the SPIRE content iframe before locating the element
    logger.debug("click_and_wait: element_id=%s - ensuring iframe", element_id)
    ensure_iframe(driver)

    logger.debug("click_and_wait: locating element %s", element_id)
    el = WebDriverWait(driver, TIMEOUT).until(
        EC.element_to_be_clickable((By.ID, element_id))
    )
    logger.debug("click_and_wait: clicking element %s", element_id)
    driver.execute_script("arguments[0].click();", el)
    logger.debug("click_and_wait: clicked %s — waiting for SPIRE load", element_id)
    wait_for_spire(driver)

    # After navigation, re-enter the iframe so subsequent calls operate in the
    # expected frame context (avoids stale/no-frame stalls).
    logger.debug("click_and_wait: re-entering iframe after click %s", element_id)
    ensure_iframe(driver)
    logger.debug("click_and_wait: complete for %s", element_id)


def select_by_value(driver: webdriver.Chrome, element_id: str, value: str):
    logger.debug("select_by_value: element_id=%s value=%s", element_id, value)
    ensure_iframe(driver)

    el = WebDriverWait(driver, TIMEOUT).until(
        EC.element_to_be_clickable((By.ID, element_id))
    )
    logger.debug("select_by_value: selecting value %s on %s", value, element_id)
    Select(el).select_by_value(value)
    wait_for_spire(driver)

    logger.debug("select_by_value: re-entering iframe after select %s", element_id)
    ensure_iframe(driver)


def select_by_text(driver: webdriver.Chrome, element_id: str, text: str):
    logger.debug("select_by_text: element_id=%s text=%s", element_id, text)
    ensure_iframe(driver)

    el = WebDriverWait(driver, TIMEOUT).until(
        EC.element_to_be_clickable((By.ID, element_id))
    )
    logger.debug("select_by_text: selecting text %s on %s", text, element_id)
    Select(el).select_by_visible_text(text)
    wait_for_spire(driver)

    logger.debug("select_by_text: re-entering iframe after select %s", element_id)
    ensure_iframe(driver)


# ---------------------------------------------------------------------------
# Boot — navigate to class search
# ---------------------------------------------------------------------------

def boot(driver: webdriver.Chrome):
    print("Navigating to SPIRE...")
    driver.get(SPIRE_URL)

    # Click the "Search for Classes" link — use JS click to bypass any overlay
    el = WebDriverWait(driver, TIMEOUT).until(
        EC.presence_of_element_located((By.NAME, "CourseCatalogLink"))
    )
    driver.execute_script("arguments[0].scrollIntoView(true);", el)
    sleep(0.5)
    driver.execute_script("arguments[0].click();", el)

    WebDriverWait(driver, TIMEOUT).until(EC.title_is("Search for Classes"))
    wait_for_spire(driver)
    switch_to_iframe(driver)
    wait_for_spire(driver)
    print("On class search page.")


# ---------------------------------------------------------------------------
# Discover available terms and subjects from the dropdowns
# ---------------------------------------------------------------------------

def get_options(driver: webdriver.Chrome):
    term_select = WebDriverWait(driver, TIMEOUT).until(
        EC.presence_of_element_located((By.ID, "UM_DERIVED_SA_UM_TERM_DESCR"))
    )
    # SPIRE stores terms as "2025 Spring" — swap to "Spring 2025"
    term_options = []
    for opt in term_select.find_elements(By.CSS_SELECTOR, "option"):
        val = opt.get_property("value")
        text = opt.text.strip()
        if not val:
            continue
        parts = text.split(" ")
        if len(parts) == 2:
            text = f"{parts[1]} {parts[0]}"
        term_options.append((val, text))

    subj_select = driver.find_element(By.ID, "CLASS_SRCH_WRK2_SUBJECT$108$")
    subject_options = []
    for opt in subj_select.find_elements(By.CSS_SELECTOR, "option"):
        val = opt.get_property("value")
        text = opt.text.strip()
        if val:
            subject_options.append((val, text))

    return term_options, subject_options


# ---------------------------------------------------------------------------
# Instructor parsing (adapted from spire_search.py reference)
# ---------------------------------------------------------------------------

def parse_instructors(driver: webdriver.Chrome) -> list[list[str]]:
    """
    Returns a list-of-lists: one inner list per course group on the page,
    each containing instructor name strings.
    """
    result = []
    instructor_divs = driver.find_elements(
        By.CSS_SELECTOR, "div[id^='win0divUM_DERIVED_SR_UM_HTML1']"
    )
    for div in instructor_divs:
        raw = div.text.strip()
        # Collapse whitespace
        while "\n\n" in raw or "  " in raw:
            raw = raw.replace("\n\n", "\n").replace("  ", " ")

        if not raw or raw in ("Staff", "TBD"):
            result.append(["Staff"])
            continue

        names = []
        # Prefer email link text — most reliable
        for link in div.find_elements(By.CSS_SELECTOR, "a[href^='mailto:']"):
            name = link.text.strip().rstrip(",")
            if name:
                names.append(name)

        if not names:
            # Fall back to raw text split
            names = [n.strip() for n in raw.split(",") if n.strip()]

        result.append(names)

    return result


# ---------------------------------------------------------------------------
# Parse one page of search results
# ---------------------------------------------------------------------------

def parse_results(driver: webdriver.Chrome, term: str, subject_id: str) -> tuple[list, list]:
    """Returns (courses, sections) lists parsed from the current results page."""
    courses = []
    sections = []

    # Each course group has a span like "COMPSCI 320 Software Engineering"
    course_spans = driver.find_elements(
        By.CSS_SELECTOR, "span[id^='DERIVED_CLSRCH_DESCR200']"
    )

    if not course_spans:
        return courses, sections

    # Instructor divs line up 1-to-1 with course group rows
    instructor_groups = parse_instructors(driver)

    for i, span in enumerate(course_spans):
        text = span.text.strip()
        # Expected: "COMPSCI 320 Software Engineering"
        m = re.match(r"(\S+)\s+(\S+)\s+(.+)", text)
        if not m:
            print(f"  WARNING: could not parse course span: {text!r}")
            continue

        raw_subject, number, title = m.group(1), m.group(2), m.group(3)
        course_number = f"{raw_subject} {number}"

        course = {
            "course_number": course_number,
            "subject": raw_subject,
            "number": number,
            "name": title.strip(),
        }
        courses.append(course)

        instructors = instructor_groups[i] if i < len(instructor_groups) else ["Staff"]
        sections.append({
            "course_number": course_number,
            "semester": term,
            "instructors": instructors,
        })

    return courses, sections


# ---------------------------------------------------------------------------
# Set up search form for one subject + term
# ---------------------------------------------------------------------------

def initialize_search(driver: webdriver.Chrome, term_value: str, subject_value: str):
    print(f"      init[1/4] selecting term {term_value!r}...", flush=True)
    select_by_value(driver, "UM_DERIVED_SA_UM_TERM_DESCR", term_value)

    print(f"      init[2/4] selecting subject {subject_value!r}...", flush=True)
    select_by_value(driver, "CLASS_SRCH_WRK2_SUBJECT$108$", subject_value)

    # Set catalog number filter to >= "A" (catches everything)
    print(f"      init[3/4] setting catalog number filter...", flush=True)
    select_by_text(driver, "CLASS_SRCH_WRK2_SSR_EXACT_MATCH1", "greater than or equal to")
    nbr_input = driver.find_element(By.ID, "CLASS_SRCH_WRK2_CATALOG_NBR$8$")
    nbr_input.clear()
    nbr_input.send_keys("0")
    wait_for_spire(driver)

    # Uncheck "open classes only" so we get all sections
    print(f"      init[4/4] unchecking open-only...", flush=True)
    open_only = driver.find_element(By.ID, "CLASS_SRCH_WRK2_SSR_OPEN_ONLY")
    if open_only.is_selected():
        driver.execute_script("arguments[0].click();", open_only)
        wait_for_spire(driver)
    print(f"      init done.", flush=True)


# ---------------------------------------------------------------------------
# Main scrape loop
# ---------------------------------------------------------------------------

def _select_terms(term_options: list, term_filter: str | None, all_terms: bool, years: int | None) -> list:
    if term_filter:
        matched = [(v, t) for v, t in term_options if t == term_filter]
        if not matched:
            print(f"ERROR: term {term_filter!r} not found. Available:")
            for _, t in term_options:
                print(f"  {t}")
            sys.exit(1)
        return matched

    if all_terms or years:
        cutoff_year = None
        if years:
            # term text is e.g. "Spring 2025" — parse year from end
            import datetime
            cutoff_year = datetime.date.today().year - years
        result = []
        for v, t in term_options:
            if cutoff_year:
                try:
                    term_year = int(t.split()[-1])
                    if term_year < cutoff_year:
                        continue
                except ValueError:
                    pass
            result.append((v, t))
        return result

    # Default: most recent term only
    return [term_options[0]]


# ---------------------------------------------------------------------------
# Ctrl-C handler — finish current subject, then save and quit cleanly
# ---------------------------------------------------------------------------

_quit_requested = False


def _sigint_handler(sig, frame):
    global _quit_requested
    if _quit_requested:
        print("\nForce quitting.")
        sys.exit(1)
    print("\nCtrl-C caught — finishing current subject then saving session. Ctrl-C again to force quit.")
    _quit_requested = True


signal.signal(signal.SIGINT, _sigint_handler)


# ---------------------------------------------------------------------------
# Session — tracks completed terms and in-progress subjects across runs
# ---------------------------------------------------------------------------

SESSION_FILE = os.path.join(OUT_DIR, "session.json")


def load_session() -> tuple[set[str], dict[str, set[str]]]:
    """
    Returns:
        completed_terms  — set of fully-scraped term labels
        completed_subjects — dict of term -> set of scraped subject IDs (partial terms)
    """
    if not os.path.exists(SESSION_FILE):
        return set(), {}
    with open(SESSION_FILE) as f:
        data = json.load(f)
    completed_terms = set(data.get("completed_terms", []))
    completed_subjects = {
        term: set(subjects)
        for term, subjects in data.get("completed_subjects", {}).items()
    }
    return completed_terms, completed_subjects


def save_session(completed_terms: set[str], completed_subjects: dict[str, set[str]]):
    with open(SESSION_FILE, "w") as f:
        json.dump(
            {
                "completed_terms": sorted(completed_terms),
                "completed_subjects": {
                    term: sorted(subjects)
                    for term, subjects in completed_subjects.items()
                    if subjects  # omit empty entries
                },
            },
            f,
            indent=2,
        )


def load_existing_output() -> tuple[set[str], set[tuple]]:
    """
    Read any existing courses.json and sections.json so we don't duplicate
    rows that were written in a previous run.
    """
    seen_courses: set[str] = set()
    seen_sections: set[tuple] = set()

    courses_path = os.path.join(OUT_DIR, "courses.json")
    if os.path.exists(courses_path):
        with open(courses_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        row = json.loads(line)
                        seen_courses.add(row["course_number"])
                    except (json.JSONDecodeError, KeyError):
                        pass

    sections_path = os.path.join(OUT_DIR, "sections.json")
    if os.path.exists(sections_path):
        with open(sections_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        row = json.loads(line)
                        seen_sections.add((row["course_number"], row["semester"]))
                    except (json.JSONDecodeError, KeyError):
                        pass

    return seen_courses, seen_sections


def append_output(courses: list[dict], sections: list[dict]):
    """Append new rows to the output files immediately after each term."""
    courses_path = os.path.join(OUT_DIR, "courses.json")
    sections_path = os.path.join(OUT_DIR, "sections.json")

    with open(courses_path, "a") as f:
        for c in courses:
            f.write(json.dumps(c) + "\n")

    with open(sections_path, "a") as f:
        for s in sections:
            f.write(json.dumps(s) + "\n")


# ---------------------------------------------------------------------------
# Main scrape loop
# ---------------------------------------------------------------------------

def scrape(term_filter: str | None, subject_filter: str | None, all_terms: bool, years: int | None, force: bool):
    global _quit_requested
    os.makedirs(OUT_DIR, exist_ok=True)

    completed_terms, completed_subjects = load_session()
    if (completed_terms or completed_subjects) and not force:
        print(f"Session: {len(completed_terms)} full term(s) done, {len(completed_subjects)} partial term(s).")
        if completed_terms:
            print(f"  Complete: {sorted(completed_terms)}")
        if completed_subjects:
            for term, subjects in sorted(completed_subjects.items()):
                print(f"  Partial — {term}: {len(subjects)} subjects done")
        print(f"  Use --force to re-scrape everything.")

    seen_courses, seen_sections = load_existing_output()
    print(f"Existing output: {len(seen_courses)} courses, {len(seen_sections)} sections already on disk.")

    driver = make_driver()
    try:
        boot(driver)

        term_options, subject_options = get_options(driver)
        print(f"Found {len(term_options)} terms, {len(subject_options)} subjects.")

        target_terms = _select_terms(term_options, term_filter, all_terms, years)
        print(f"Target term(s): {[t for _, t in target_terms]}")

        for term_value, term_label in target_terms:
            if _quit_requested:
                break

            if term_label in completed_terms and not force:
                print(f"\n=== {term_label} — SKIPPING (complete in session) ===")
                continue

            done_subjects = completed_subjects.get(term_label, set()) if not force else set()
            skipped_subjects = len(done_subjects)
            print(f"\n=== {term_label} ==={f' (resuming — {skipped_subjects} subjects already done)' if skipped_subjects else ''}")

            for subject_value, subject_title in subject_options:
                if _quit_requested:
                    break

                subject_id = subject_value

                if subject_filter and subject_id != subject_filter:
                    continue

                if subject_id in done_subjects:
                    continue  # already scraped in a previous interrupted run

                print(f"  Searching {subject_id}...", end=" ", flush=True)

                try:
                    initialize_search(driver, term_value, subject_value)
                    click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH")
                except TimeoutException:
                    print("TIMEOUT on search, skipping.")
                    try:
                        click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                    except Exception:
                        pass
                    continue
                except Exception:
                    if _quit_requested:
                        break  # Ctrl-C interrupted a live selenium call — expected
                    raise

                error_span = None
                try:
                    error_span = driver.find_element(By.ID, "DERIVED_CLSMSG_ERROR_TEXT")
                except NoSuchElementException:
                    pass

                if error_span:
                    print(f"no results.")
                    # Still mark as done so we don't re-check it on resume
                    completed_subjects.setdefault(term_label, set()).add(subject_id)
                    save_session(completed_terms, completed_subjects)
                    continue

                courses, sections = parse_results(driver, term_label, subject_id)
                print(f"{len(courses)} courses.")

                new_courses = []
                for c in courses:
                    if c["course_number"] not in seen_courses:
                        seen_courses.add(c["course_number"])
                        new_courses.append(c)

                new_sections = []
                for s in sections:
                    key = (s["course_number"], s["semester"])
                    if key not in seen_sections:
                        seen_sections.add(key)
                        new_sections.append(s)

                # Save after every subject so partial runs are preserved
                append_output(new_courses, new_sections)
                completed_subjects.setdefault(term_label, set()).add(subject_id)
                save_session(completed_terms, completed_subjects)

                try:
                    click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                except TimeoutException:
                    print("  WARNING: could not return to new search.")

            # Mark term fully complete only if we finished all subjects without quitting
            if not _quit_requested and not subject_filter:
                completed_terms.add(term_label)
                completed_subjects.pop(term_label, None)  # clean up partial entry
                save_session(completed_terms, completed_subjects)
                print(f"  {term_label} complete.")

    finally:
        try:
            driver.quit()
        except Exception:
            pass  # driver may already be dead if Ctrl-C hit mid-call
        if _quit_requested:
            print(f"\nQuit early. Progress saved to session.json — re-run to resume.")
        print(f"\nSession: {sorted(completed_terms)} complete, {list(completed_subjects.keys())} partial.")


# ---------------------------------------------------------------------------
# Probe — identify the DOM element ID(s) that carry units/credit data
# ---------------------------------------------------------------------------

def probe_units(driver: webdriver.Chrome):
    """
    Called after a successful class search. Dumps DOM info to stdout so we can
    identify which element ID contains credit/units data.

    Sections:
      1. All elements whose ID contains UNIT, CREDIT, or HRS
      2. Visible elements whose text matches a credit pattern (e.g. "3.00", "1.00 - 4.00")
      3. The most common element-ID patterns on the page (to spot new prefixes)
    """
    SEP = "─" * 70

    def sec(title):
        print(f"\n{'=' * 70}\n  {title}\n{'=' * 70}")

    # 1. Keyword scan on element IDs
    sec("1. Elements with IDs containing UNIT / CREDIT / HRS")
    keywords = ["UNIT", "CREDIT", "HRS", "HOUR"]
    seen_ids: set[str] = set()
    hits = []
    for kw in keywords:
        for el in driver.find_elements(By.CSS_SELECTOR, f"[id*='{kw}']"):
            eid = el.get_property("id") or ""
            if eid and eid not in seen_ids and any(k in eid.upper() for k in keywords):
                seen_ids.add(eid)
                hits.append(el)

    if not hits:
        print("  NONE FOUND.")
    else:
        print(f"  Found {len(hits)} element(s):\n")
        for el in hits:
            eid = el.get_property("id")
            text = el.text.strip().replace("\n", " ")[:80]
            print(f"  id={eid!r:60s}  tag={el.tag_name:6s}  displayed={el.is_displayed()}  text={text!r}")

    # 2. Visible elements whose text looks like a credit value
    sec("2. Visible elements whose text matches a credit pattern (e.g. '3.00', '1.00 - 4.00')")
    credit_re = re.compile(r'^\d+\.00(\s*-\s*\d+\.00)?$')
    seen_patterns: set[tuple] = set()
    credit_hits = []
    for el in driver.find_elements(By.CSS_SELECTOR, "span, td, div"):
        try:
            if not el.is_displayed():
                continue
            txt = el.text.strip()
            if not credit_re.match(txt):
                continue
            eid = el.get_property("id") or ""
            # Normalize $N suffix to see the pattern
            id_pat = re.sub(r'\$\d+$', '$N', eid)
            key = (id_pat, txt)
            if key not in seen_patterns:
                seen_patterns.add(key)
                credit_hits.append((eid, id_pat, el.tag_name, txt))
        except Exception:
            continue

    if not credit_hits:
        print("  No visible elements with credit-pattern text found.")
    else:
        print(f"  Found {len(credit_hits)} unique (id-pattern, text) pair(s):\n")
        for eid, id_pat, tag, txt in credit_hits[:30]:
            print(f"  example_id={eid!r:55s}  pattern={id_pat!r:45s}  tag={tag:6s}  text={txt!r}")

    # 3. Top element-ID patterns on the page
    sec("3. Top 50 element-ID patterns on the page (count of $N variants)")
    all_ids: list[str] = driver.execute_script(
        "return Array.from(document.querySelectorAll('[id]')).map(e => e.id).filter(Boolean);"
    )
    pattern_counts: dict[str, int] = {}
    for eid in all_ids:
        pat = re.sub(r'\$\d+$', '$N', eid)
        pattern_counts[pat] = pattern_counts.get(pat, 0) + 1
    sorted_pats = sorted(pattern_counts.items(), key=lambda x: (-x[1], x[0]))
    print(f"  Total IDs: {len(all_ids)}  |  Unique patterns: {len(pattern_counts)}\n")
    for pat, count in sorted_pats[:50]:
        print(f"  {count:4d}x  {pat!r}")

    print(f"\n{SEP}\nProbe complete. Review sections 1 and 2 above to identify the units element.\n{SEP}\n")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--term", help='Single term, e.g. "Spring 2025"')
    parser.add_argument("--subject", help='Single subject, e.g. COMPSCI — useful for testing')
    parser.add_argument("--all-terms", action="store_true", help="Scrape every term in the SPIRE dropdown")
    parser.add_argument("--years", type=int, help="Scrape all terms within the last N years, e.g. --years 4")
    parser.add_argument("--force", action="store_true", help="Ignore session and re-scrape already-completed terms")
    parser.add_argument("--probe-units", action="store_true",
                        help="DOM probe: search one subject and dump units-related element IDs to stdout")
    args = parser.parse_args()

    if args.probe_units:
        subject = (args.subject or "COMPSCI").upper()
        driver = make_driver()
        try:
            boot(driver)
            term_options, subject_options = get_options(driver)

            if args.term:
                matched = [(v, t) for v, t in term_options if t == args.term]
                if not matched:
                    print(f"ERROR: term {args.term!r} not found.")
                    sys.exit(1)
                term_value, term_label = matched[0]
            else:
                term_value, term_label = term_options[0]

            if subject not in [s[0] for s in subject_options]:
                print(f"ERROR: subject {subject!r} not in dropdown.")
                sys.exit(1)

            print(f"Probing: subject={subject!r}  term={term_label!r}")
            initialize_search(driver, term_value, subject)
            click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH")

            try:
                err = driver.find_element(By.ID, "DERIVED_CLSMSG_ERROR_TEXT")
                print(f"ERROR: no results — {err.text.strip()!r}")
                sys.exit(1)
            except NoSuchElementException:
                pass

            print("Results loaded. Running probe...\n")
            probe_units(driver)
        finally:
            input("[Press Enter to close the browser] ")
            try:
                driver.quit()
            except Exception:
                pass
    else:
        scrape(
            term_filter=args.term,
            subject_filter=args.subject,
            all_terms=args.all_terms,
            years=args.years,
            force=args.force,
        )
