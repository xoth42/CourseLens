"""
scrape_colleges.py — Scrape the Academic Group (college/school) for each subject.

Navigates SPIRE's Browse Course Catalog (NOT Class Search) and reads the
"Academic Group" field from each subject's first course detail page. That field
is what SPIRE uses for the college/school grouping.

Why the catalog and not Class Search:
    Class Search section detail pages do NOT display the "Academic Group" field —
    confirmed by log analysis. The field only appears on Course Catalog course
    detail pages (table.PSGROUPBOXNBO / "Course Detail" section). The reference
    project's spire-api confirms this: raw_course_detail.py and spire_catalog.py
    both target the catalog, while spire_search.py section details don't capture
    Academic Group at all.

Catalog navigation (from spire-api/spire_catalog.py reference):
    - Letter buttons:  DERIVED_SSS_BCC_SSR_ALPHANUM_{A..Z}  (skip Q, V, X, Z)
    - Subject links:   a[id^=DERIVED_SSS_BCC_GROUP_BOX_]    text: "ACCOUNTG - Accounting"
    - Course links:    a[id^=CRSE_NBR]
    - Course detail:   table.PSGROUPBOXNBO  → "Course Detail" section → Academic Group
    - Back button:     DERIVED_SAA_CRS_RETURN_PB

Output:
    out/subject_colleges.json — {"subject": "COMPSCI", "college": "Manning College of ..."}
    out/college_session.json  — resume tracker per subject
    logs/<label>.log          — diagnostic log (--log is REQUIRED)

Usage:
    python scrape_colleges.py --log run1            # all subjects
    python scrape_colleges.py --log run1 --force    # re-scrape all
    python scrape_colleges.py --log run1 --subject COMPSCI   # test one subject
"""

import argparse
import json
import logging
import os
import re
import signal
import sys
from datetime import datetime
from time import sleep

from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.wait import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

SPIRE_URL = "https://www.spire.umass.edu"
# Browse Course Catalog — standard PeopleSoft Campus Solutions URL
CATALOG_URL = "https://www.spire.umass.edu/psp/heproda/EMPLOYEE/SA/c/COMMUNITY_ACCESS.SSS_BROWSE_CATLG.GBL"

OUT_DIR = os.path.join(os.path.dirname(__file__), "out")
LOGS_DIR = os.path.join(os.path.dirname(__file__), "logs")
OUTPUT_FILE = os.path.join(OUT_DIR, "subject_colleges.json")
SESSION_FILE = os.path.join(OUT_DIR, "college_session.json")

TIMEOUT = 120  # seconds

# Letters the catalog organizes subjects under (Q, V, X, Z have none per reference)
CATALOG_LETTERS = [c for c in "ABCDEFGHIJKLMNOPRSTUWXY" if c not in ("Q", "V", "X", "Z")]

# ---------------------------------------------------------------------------
# College name normalization — maps SPIRE abbreviated labels → canonical names
# Source: spire-api.melanson.dev raw_academic_group.py GROUP_OVERRIDES
# ---------------------------------------------------------------------------

GROUP_OVERRIDES = {
    "College of Humanities&Fine Art":   "College of Humanities & Fine Arts",
    "Stockbridge School":               "Stockbridge School of Agriculture",
    "College of Social & Behav. Sci":   "College of Social & Behavioral Sciences",
    "College of Info & Computer Sci":   "Manning College of Information & Computer Sciences",
    "College of Natural Sci. & Math":   "College of Natural Sciences",
    "School of Pub Hlth & Hlth Sci":    "School of Public Health & Health Sciences",
    "Sch. of Public Health&Hlth Sci":   "School of Public Health & Health Sciences",
    "School of Education":              "College of Education",
    "School of Management":             "Isenberg School of Management",
    "Commonwealth College":             "Commonwealth Honors College",
}

OTHER_COLLEGE = "Other"


def normalize_college(raw: str) -> str:
    return GROUP_OVERRIDES.get(raw.strip(), raw.strip())


# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

log = logging.getLogger("scrape_colleges")


def setup_logging(label: str) -> str:
    os.makedirs(LOGS_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(LOGS_DIR, f"{ts}_{label}.log")

    log.setLevel(logging.DEBUG)

    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    log.addHandler(fh)

    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(ch)

    log.info(f"Log file: {log_path}")
    return log_path


# ---------------------------------------------------------------------------
# Diagnostic helpers
# ---------------------------------------------------------------------------

def log_page_state(driver: webdriver.Chrome, context: str):
    try:
        log.debug(f"[{context}] title={driver.title!r}")
    except Exception as e:
        log.debug(f"[{context}] title error: {e}")

    checks = [
        ("DERIVED_SAA_CRS_RETURN_PB",       "catalog back button"),
        ("CLASS_SRCH_WRK2_SSR_PB_BACK",     "search back button"),
        ("DERIVED_CRSECAT_DESCR200",         "catalog course title span"),
    ]
    for elem_id, label in checks:
        try:
            el = driver.find_element(By.ID, elem_id)
            log.debug(f"[{context}] FOUND {label}: displayed={el.is_displayed()}, text={el.text.strip()!r:.60}")
        except NoSuchElementException:
            log.debug(f"[{context}] NOT FOUND: {label} ({elem_id})")
        except Exception as e:
            log.debug(f"[{context}] ERROR {label}: {e}")


def log_acad_group_area(driver: webdriver.Chrome, context: str):
    """Dump everything related to Academic Group on the current page."""
    # Try exact known IDs
    for elem_id in [
        "win0divACAD_GROUP_TBL_DESCR$0",
        "win0divSSR_CRSE_OFF_VW_ACAD_GROUPlbl$0",
        "ACAD_GROUP_TBL_DESCR$0",
    ]:
        try:
            el = driver.find_element(By.ID, elem_id)
            log.debug(f"[{context}] FOUND exact {elem_id!r}: text={el.text.strip()!r}, displayed={el.is_displayed()}")
        except NoSuchElementException:
            log.debug(f"[{context}] NOT FOUND exact: {elem_id!r}")

    # Broad CSS scan
    try:
        els = driver.find_elements(By.CSS_SELECTOR, "[id*='ACAD_GROUP']")
        log.debug(f"[{context}] CSS [id*='ACAD_GROUP'] count: {len(els)}")
        for el in els[:10]:
            try:
                log.debug(f"[{context}]   id={el.get_property('id')!r}, text={el.text.strip()!r:.80}, displayed={el.is_displayed()}")
            except Exception:
                pass
    except Exception as e:
        log.debug(f"[{context}] CSS scan error: {e}")

    # Also look for any table headings (PSGROUPBOXNBO) to see what sections exist
    try:
        tables = driver.find_elements(By.CSS_SELECTOR, "table.PSGROUPBOXNBO")
        log.debug(f"[{context}] PSGROUPBOXNBO table count: {len(tables)}")
        for i, t in enumerate(tables[:5]):
            try:
                label_el = t.find_element(By.CSS_SELECTOR, "tbody > tr:first-child > td")
                log.debug(f"[{context}]   table[{i}] heading: {label_el.text.strip()!r:.60}")
            except Exception:
                log.debug(f"[{context}]   table[{i}] (no heading found)")
    except Exception as e:
        log.debug(f"[{context}] table scan error: {e}")


# ---------------------------------------------------------------------------
# Driver / SPIRE helpers
# ---------------------------------------------------------------------------

def make_driver() -> webdriver.Chrome:
    opts = webdriver.ChromeOptions()
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1920,1080")
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=opts)


def wait_for_spire(driver: webdriver.Chrome):
    WebDriverWait(driver, TIMEOUT).until_not(
        EC.text_to_be_present_in_element_attribute(
            (By.CSS_SELECTOR, "body.PSPAGE"), "style", "none"
        )
    )


def switch_to_iframe(driver: webdriver.Chrome):
    WebDriverWait(driver, TIMEOUT).until(
        EC.frame_to_be_available_and_switch_to_it((By.NAME, "TargetContent"))
    )


def click_and_wait(driver: webdriver.Chrome, element_id: str):
    el = WebDriverWait(driver, TIMEOUT).until(
        EC.element_to_be_clickable((By.ID, element_id))
    )
    driver.execute_script("arguments[0].click();", el)
    wait_for_spire(driver)


# ---------------------------------------------------------------------------
# Boot — navigate to Browse Course Catalog
# ---------------------------------------------------------------------------

def boot_to_catalog(driver: webdriver.Chrome):
    log.info("Navigating to SPIRE Browse Course Catalog...")
    driver.get(CATALOG_URL)

    # PeopleSoft may redirect to a login or landing page — wait for TargetContent iframe
    try:
        WebDriverWait(driver, TIMEOUT).until(
            EC.frame_to_be_available_and_switch_to_it((By.NAME, "TargetContent"))
        )
    except TimeoutException:
        # May need to go through the main SPIRE landing page first
        log.info("TargetContent iframe not found directly — trying via SPIRE main page...")
        driver.switch_to.default_content()
        driver.get(SPIRE_URL)
        sleep(2)
        # Try navigating to catalog again
        driver.get(CATALOG_URL)
        WebDriverWait(driver, TIMEOUT).until(
            EC.frame_to_be_available_and_switch_to_it((By.NAME, "TargetContent"))
        )

    wait_for_spire(driver)
    log.info(f"Catalog iframe loaded. Title: {driver.title!r}")
    log_page_state(driver, "boot_catalog")

    # Verify we're on the catalog by checking for a letter button
    try:
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.ID, "DERIVED_SSS_BCC_SSR_ALPHANUM_A"))
        )
        log.info("Confirmed on Browse Course Catalog page (letter buttons present).")
    except TimeoutException:
        log.error("Letter buttons not found — may not be on catalog page.")
        log.error("Dumping page source excerpt...")
        try:
            body_text = driver.find_element(By.TAG_NAME, "body").text[:500]
            log.error(f"Body text: {body_text!r}")
        except Exception:
            pass
        raise RuntimeError("Could not reach Browse Course Catalog. Check CATALOG_URL.")


# ---------------------------------------------------------------------------
# Session / resume
# ---------------------------------------------------------------------------

def load_session() -> dict[str, str]:
    if not os.path.exists(SESSION_FILE):
        return {}
    with open(SESSION_FILE) as f:
        return json.load(f)


def save_session(results: dict[str, str]):
    with open(SESSION_FILE, "w") as f:
        json.dump(results, f, indent=2, sort_keys=True)


# ---------------------------------------------------------------------------
# Catalog scraping — one subject at a time
# ---------------------------------------------------------------------------

CATALOG_BACK_ID = "DERIVED_SAA_CRS_RETURN_PB"
CATALOG_COURSE_TITLE_ID = "DERIVED_CRSECAT_DESCR200"
ACAD_GROUP_VALUE_ID = "win0divACAD_GROUP_TBL_DESCR$0"


def read_academic_group_from_catalog(driver: webdriver.Chrome, subject_id: str) -> str | None:
    """
    Read the Academic Group from the current catalog course detail page.
    Element ID confirmed from spire-api raw_course_detail.py: win0divACAD_GROUP_TBL_DESCR$0
    Table selector: table.PSGROUPBOXNBO (catalog uses NBO, not WBO like class search)
    """
    log_page_state(driver, f"course_detail/{subject_id}")
    log_acad_group_area(driver, f"course_detail/{subject_id}")

    try:
        el = WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.ID, ACAD_GROUP_VALUE_ID))
        )
        text = el.text.strip()
        log.debug(f"read_academic_group [{subject_id}]: raw = {text!r}")
        return text if text else None
    except TimeoutException:
        log.warning(f"read_academic_group [{subject_id}]: TIMEOUT — element not found in 20s")
        return None


def scrape_one_subject(
    driver: webdriver.Chrome,
    subject_link_id: str,
    subject_id: str,
    subject_title: str,
) -> str | None:
    """
    From the catalog letter-group page:
    1. Click subject link to expand its course list
    2. Click first course link
    3. Read Academic Group
    4. Click back (DERIVED_SAA_CRS_RETURN_PB)
    5. Click subject link again to collapse

    Returns normalized college name or None.
    """
    log.debug(f"scrape_one_subject: {subject_id!r} ({subject_title!r}), link={subject_link_id!r}")

    # Step 1: expand subject
    try:
        el = WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.ID, subject_link_id))
        )
        driver.execute_script("arguments[0].click();", el)
        wait_for_spire(driver)
        log.debug(f"[{subject_id}] Expanded subject list.")
    except (TimeoutException, Exception) as e:
        log.warning(f"[{subject_id}] Failed to expand subject: {e}")
        return None

    # Step 2: find first course link
    course_links = driver.find_elements(By.CSS_SELECTOR, "a[id^='CRSE_NBR']")
    log.debug(f"[{subject_id}] Course links found: {len(course_links)}")
    for i, cl in enumerate(course_links[:3]):
        try:
            log.debug(f"[{subject_id}]   course[{i}] id={cl.get_property('id')!r}, text={cl.text.strip()!r}")
        except Exception:
            pass

    if not course_links:
        log.warning(f"[{subject_id}] No course links found after expanding subject.")
        # Try to collapse anyway
        try:
            el = driver.find_element(By.ID, subject_link_id)
            driver.execute_script("arguments[0].click();", el)
            wait_for_spire(driver)
        except Exception:
            pass
        return None

    # Step 3: click first course
    first_course = course_links[0]
    try:
        course_id_text = first_course.get_property("id")
        course_text = first_course.text.strip()
        log.debug(f"[{subject_id}] Clicking course: {course_id_text!r} / {course_text!r}")
        driver.execute_script("arguments[0].click();", first_course)
        wait_for_spire(driver)
    except Exception as e:
        log.warning(f"[{subject_id}] Failed to click course link: {e}")
        return None

    # Step 4: read Academic Group
    raw_college = read_academic_group_from_catalog(driver, subject_id)

    # Step 5: click back to return to catalog subject list
    try:
        click_and_wait(driver, CATALOG_BACK_ID)
        log.debug(f"[{subject_id}] Clicked catalog back button.")
    except (TimeoutException, Exception) as e:
        log.warning(f"[{subject_id}] Failed to click catalog back: {e}")

    # Step 6: collapse subject (click subject link again)
    try:
        el = WebDriverWait(driver, TIMEOUT).until(
            EC.element_to_be_clickable((By.ID, subject_link_id))
        )
        driver.execute_script("arguments[0].click();", el)
        wait_for_spire(driver)
        log.debug(f"[{subject_id}] Collapsed subject list.")
    except Exception as e:
        log.debug(f"[{subject_id}] Could not collapse subject (may be fine): {e}")

    if raw_college:
        normalized = normalize_college(raw_college)
        log.info(f"  {subject_id} → {normalized!r} (raw: {raw_college!r})")
        return normalized

    return None


# ---------------------------------------------------------------------------
# Main catalog loop — iterate letters → subjects → one course each
# ---------------------------------------------------------------------------

def scrape_all_subjects(
    driver: webdriver.Chrome,
    results: dict[str, str],
    subject_filter: str | None,
) -> dict[str, str]:
    """
    Walks the catalog letter by letter. For each subject found, scrapes one
    course to get Academic Group. Updates results in-place and saves after each.
    """
    global _quit_requested

    for letter in CATALOG_LETTERS:
        if _quit_requested:
            break

        log.info(f"\n=== Letter {letter} ===")

        # Click the letter tab
        try:
            click_and_wait(driver, f"DERIVED_SSS_BCC_SSR_ALPHANUM_{letter}")
        except TimeoutException:
            log.warning(f"Letter {letter}: could not click letter button — skipping.")
            continue

        # Find all subject links on this letter's page
        subject_links = driver.find_elements(By.CSS_SELECTOR, "a[id^='DERIVED_SSS_BCC_GROUP_BOX_']")
        log.debug(f"Letter {letter}: found {len(subject_links)} subject links.")

        if not subject_links:
            log.info(f"Letter {letter}: no subjects found.")
            continue

        # Snapshot link IDs and titles before any clicks invalidate the DOM
        subjects_on_page = []
        for sl in subject_links:
            try:
                link_id = sl.get_property("id")
                raw_text = sl.text.strip()  # e.g. "ACCOUNTG - Accounting"
                # Parse subject code from "CODE - Title" format
                m = re.match(r"^(\S+)\s*-\s*(.+)$", raw_text)
                if m:
                    subj_code = m.group(1).strip().upper()
                    subj_title = m.group(2).strip()
                else:
                    subj_code = raw_text.split()[0].upper() if raw_text else "UNKNOWN"
                    subj_title = raw_text
                subjects_on_page.append((link_id, subj_code, subj_title))
                log.debug(f"  Subject: {subj_code!r} / {subj_title!r} / link={link_id!r}")
            except Exception as e:
                log.debug(f"  Could not read subject link: {e}")

        # Process each subject
        for link_id, subj_code, subj_title in subjects_on_page:
            if _quit_requested:
                break

            # Filter mode
            if subject_filter and subj_code != subject_filter.upper():
                continue

            # Resume skip
            if subj_code in results:
                log.info(f"  {subj_code}: already done ({results[subj_code]}) — skipping")
                continue

            log.info(f"  Scraping {subj_code} ({subj_title})...")

            college = scrape_one_subject(driver, link_id, subj_code, subj_title)

            if not college:
                college = OTHER_COLLEGE
                log.info(f"  {subj_code} → {OTHER_COLLEGE} (Academic Group not found)")

            results[subj_code] = college
            save_session(results)

    return results


# ---------------------------------------------------------------------------
# Ctrl-C handler
# ---------------------------------------------------------------------------

_quit_requested = False


def _sigint_handler(sig, frame):
    global _quit_requested
    if _quit_requested:
        print("\nForce quitting.")
        sys.exit(1)
    print("\nCtrl-C — finishing current subject then saving. Ctrl-C again to force quit.")
    _quit_requested = True


signal.signal(signal.SIGINT, _sigint_handler)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def scrape(force: bool, subject_filter: str | None):
    global _quit_requested
    os.makedirs(OUT_DIR, exist_ok=True)

    results: dict[str, str] = {} if force else load_session()
    if results:
        log.info(f"Resuming: {len(results)} subjects already recorded.")

    driver = make_driver()
    try:
        boot_to_catalog(driver)
        scrape_all_subjects(driver, results, subject_filter)
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    # Write final output
    with open(OUTPUT_FILE, "w") as f:
        for subject, college in sorted(results.items()):
            f.write(json.dumps({"subject": subject, "college": college}) + "\n")

    log.info(f"\nDone. {len(results)} subjects written to {OUTPUT_FILE}")

    college_counts: dict[str, list[str]] = {}
    for subject, college in results.items():
        college_counts.setdefault(college, []).append(subject)
    log.info("\nCollege → subjects summary:")
    for college, subjects in sorted(college_counts.items()):
        log.info(f"  {college}: {', '.join(sorted(subjects))}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scrape Academic Group (college) per SPIRE subject via the Course Catalog.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="--log is required so there is always a log to review on failure.",
    )
    parser.add_argument(
        "--log", required=True, metavar="LABEL",
        help="Label for the log file, e.g. 'run2'. Written to logs/<timestamp>_<label>.log"
    )
    parser.add_argument(
        "--subject", metavar="CODE",
        help="Test a single subject code, e.g. COMPSCI. Skips all others."
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-scrape all subjects, ignoring the resume file."
    )
    args = parser.parse_args()

    setup_logging(args.log)
    log.info(f"Starting — label={args.log!r}, subject={args.subject!r}, force={args.force}")

    scrape(force=args.force, subject_filter=args.subject)
