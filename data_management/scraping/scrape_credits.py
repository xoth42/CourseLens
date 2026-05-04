"""
scrape_credits.py — Scrape credit counts from SPIRE Class Search results.

Reads win0divUM_DERIVED_SR_UNITS_RANGE$N (confirmed via --probe-units) which
aligns 1-to-1 with course group header spans, same as instructor divs.

Only needs one term — credit values are stable across semesters. Defaults to
the most recent term in the SPIRE dropdown.

Output:
    out/course_credits.json  — one line per unique course: {"course_number": "COMPSCI 320", "credits": 3}
    out/credits_session.json — resume tracker; subject codes already scraped

Usage:
    python scrape_credits.py                    # most recent term, all subjects
    python scrape_credits.py --subject COMPSCI  # one subject (good for testing)
    python scrape_credits.py --term "Spring 2025"
    python scrape_credits.py --force            # re-scrape subjects already in session
"""

import argparse
import datetime
import json
import os
import sys
import threading
import time
from datetime import datetime

from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.common.by import By

# Reuse all navigation helpers from scraper.py
from scraper import (
    OUT_DIR,
    boot,
    click_and_wait,
    get_options,
    initialize_search,
    make_driver,
    wait_for_spire,
    setup_logging,
)
import logging

logger = logging.getLogger(__name__)

CREDITS_FILE   = os.path.join(OUT_DIR, "course_credits.json")
UNITS_ID_PREFIX = "win0divUM_DERIVED_SR_UNITS_RANGE"


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

def load_session() -> dict[str, dict]:
    """Returns {course_number: {credits, max_credits}} for already-scraped courses.

    Uses `course_credits.json` (JSON-lines) as the single source-of-truth
    for incremental session persistence so resumed runs pick up progress.
    """
    results: dict[str, dict] = {}
    if not os.path.exists(CREDITS_FILE):
        return results
    with open(CREDITS_FILE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                results[row["course_number"]] = {
                    "credits": row.get("credits"),
                    "max_credits": row.get("max_credits"),
                }
            except (json.JSONDecodeError, KeyError):
                # ignore malformed lines and continue
                pass
    return results


def save_session(results: dict[str, dict]):
    """Persist `results` to `course_credits.json` as JSON-lines (overwrite)."""
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(CREDITS_FILE, "w") as f:
        for course_number in sorted(results.keys()):
            row = results[course_number]
            f.write(json.dumps({
                "course_number": course_number,
                "credits": row.get("credits"),
                "max_credits": row.get("max_credits"),
            }) + "\n")


# ---------------------------------------------------------------------------
# Parse credits from the current results page
# ---------------------------------------------------------------------------

def parse_credits(driver) -> list[tuple[str, int | None]]:
    """
    Returns [(course_number, credits), ...] for all course groups on the page.

    DOM structure findings (confirmed via --probe-units and debugging sessions):

    WHAT WORKS:
    - Course group headers: span[id^='DERIVED_CLSRCH_DESCR200'] — one per course, $N aligned
    - Units element ID confirmed: win0divUM_DERIVED_SR_UNITS_RANGE$N
    - Units text is a bare integer ("3"), not "3.00"

    WHAT DOES NOT WORK — index-based lookup ($N):
    - win0divUM_DERIVED_SR_UNITS_RANGE$N is indexed per *section row*, not per course group.
    - A course with 3 sections produces 3 units elements. So $N on the units side
      does not align with $N on the course span side once any course has >1 section.
    - This caused silently wrong credits (e.g. COMPSCI 589 → 1 instead of 3).

    WHAT DOES NOT WORK — DOM ancestor walk + querySelector:
    - Tried walking up from the course span and using querySelector to find the
      nearest units div within the same course group container.
    - Problem 1: [id*='UNITS_RANGE'] also matches a column header label with text
      "Units" — need the exact win0divUM_DERIVED_SR_UNITS_RANGE prefix.
    - Problem 2: Even with the exact prefix, depth=15 (not found) on all courses.
      The units divs are NOT in the ancestor chain of the course span — they are
      siblings or cousins in the table layout, unreachable by walking up.

    NEXT APPROACH TO TRY:
    - Query all units divs and all course spans separately, then build the mapping
      by DOM position order (units div $N belongs to the Nth course group that
      precedes it in document order), OR
    - Use the probe to dump the full DOM around a known course (e.g. COMPSCI 320)
      to understand the actual container structure and find the right selector.

    WHAT WORKS (current):
    - Query all course spans and all units divs separately, then pair by document
      order using compareDocumentPosition. For each course span, find the first
      units div that follows it in the DOM — that's the first section row for that
      course. Credits are the same across all sections of a course.
    - Filter out units divs whose text is exactly "Units" (the column header label)
      before matching.
    """
    import re

    rows = driver.execute_script("""
        var spans = Array.from(document.querySelectorAll("span[id^='DERIVED_CLSRCH_DESCR200']"));
        var unitsDivs = Array.from(document.querySelectorAll("div[id^='win0divUM_DERIVED_SR_UNITS_RANGE']"))
            .filter(function(d) { return d.textContent.trim() !== 'Units'; });

        return spans.map(function(span) {
            for (var i = 0; i < unitsDivs.length; i++) {
                // DOCUMENT_POSITION_FOLLOWING (4): unitsDiv comes after span in DOM order
                if (span.compareDocumentPosition(unitsDivs[i]) & 4) {
                    return {
                        spanText: span.textContent.trim(),
                        unitsId: unitsDivs[i].id,
                        unitsText: unitsDivs[i].textContent.trim()
                    };
                }
            }
            return {spanText: span.textContent.trim(), unitsId: null, unitsText: null};
        });
    """)

    results = []
    for item in rows:
        text = item.get("spanText", "").strip()
        # "COMPSCI 320 Software Engineering" → "COMPSCI 320"
        m = re.match(r"(\S+)\s+(\S+)", text)
        if not m:
            continue
        course_number = f"{m.group(1)} {m.group(2)}"

        raw = item.get("unitsText")
        credits = None
        max_credits = None
        if raw:
            raw_stripped = raw.strip()
            # Check for credit range (e.g., "1-6", "1-18", "3-6")
            if "-" in raw_stripped:
                range_match = re.match(r"(\d+)\s*-\s*(\d+)", raw_stripped)
                if range_match:
                    credits = int(range_match.group(1))
                    max_credits = int(range_match.group(2))
            else:
                # Single credit value
                first = re.match(r"(\d+)", raw_stripped)
                if first:
                    credits = int(first.group(1))

        print(f"      {course_number}: units_id={item.get('unitsId')!r} raw={raw!r} → credits={credits} max_credits={max_credits}", flush=True)
        results.append((course_number, credits, max_credits))

    return results


# ---------------------------------------------------------------------------
# Main scrape loop
# ---------------------------------------------------------------------------

def scrape(term_filter: str | None, subject_filter: str | None, force: bool):
    os.makedirs(OUT_DIR, exist_ok=True)

    results: dict[str, dict] = {} if force else load_session()
    done_subjects: set[str] = set()

    # `load_session()` already reads `course_credits.json`, so `results`
    # reflects previously-scraped courses when not using `--force`.

    print(f"Session: {len(results)} courses already have credits recorded.")

    # Heartbeat: print a timestamp every 60 s so stalls are visible in the log.
    _stop_heartbeat = threading.Event()
    def _heartbeat():
        while not _stop_heartbeat.wait(60):
            print(f"  [heartbeat {datetime.now().strftime('%H:%M:%S')}]", flush=True)
    threading.Thread(target=_heartbeat, daemon=True).start()

    driver = make_driver()
    try:
        boot(driver)
        term_options, subject_options = get_options(driver)

        # Resolve term
        if term_filter:
            matched = [(v, t) for v, t in term_options if t == term_filter]
            if not matched:
                print(f"ERROR: term {term_filter!r} not found. Available:")
                for _, t in term_options:
                    print(f"  {t}")
                sys.exit(1)
            term_value, term_label = matched[0]
        else:
            # Default to the second-most-recent Fall or Spring.
            # The first entry is typically the active/upcoming semester, which SPIRE
            # serves slowly (many live sections). The previous semester is complete
            # and responds much faster, and credit values are stable across terms.
            full_terms = [(v, t) for v, t in term_options if t.startswith("Fall") or t.startswith("Spring")]
            if not full_terms:
                full_terms = term_options
            term_value, term_label = full_terms[1] if len(full_terms) > 1 else full_terms[0]

        print(f"Term: {term_label}")

        new_courses: dict[str, dict] = {}

        for subject_value, subject_title in subject_options:
            if subject_filter and subject_value != subject_filter.upper():
                continue

            print(f"  {subject_value}...", flush=True)

            print(f"    [1/5] initialize_search...", flush=True)
            try:
                initialize_search(driver, term_value, subject_value)
            except TimeoutException:
                print(f"    [1/5] TIMEOUT in initialize_search — skipping.")
                try:
                    print(f"    recovery: clicking new search...", flush=True)
                    click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                    print(f"    recovery: done.")
                except Exception as e:
                    print(f"    recovery: failed ({e})")
                continue

            print(f"    [2/5] clicking search button...", flush=True)
            try:
                click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH")
            except TimeoutException:
                print(f"    [2/5] TIMEOUT clicking search button — skipping.")
                try:
                    print(f"    recovery: clicking new search...", flush=True)
                    click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                    print(f"    recovery: done.")
                except Exception as e:
                    print(f"    recovery: failed ({e})")
                continue

            print(f"    [3/5] checking for no-results error...", flush=True)
            try:
                driver.find_element(By.ID, "DERIVED_CLSMSG_ERROR_TEXT")
                print(f"    [3/5] no results — clicking new search.", flush=True)
                try:
                    click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                except TimeoutException:
                    print(f"    [3/5] TIMEOUT clicking new search after no-results — continuing anyway.")
                continue
            except NoSuchElementException:
                print(f"    [3/5] results found.", flush=True)

            print(f"    [4/5] parsing credits...", flush=True)
            parsed = parse_credits(driver)
            added = 0
            for course_number, credits, max_credits in parsed:
                if course_number not in results or force:
                    results[course_number] = {"credits": credits, "max_credits": max_credits}
                    new_courses[course_number] = {"credits": credits, "max_credits": max_credits}
                    added += 1
            print(f"    [4/5] {len(parsed)} courses, {added} new.", flush=True)

            save_session(results)
            print(f"    session saved: {len(results)} total courses recorded.", flush=True)

            print(f"    [5/5] clicking new search to reset...", flush=True)
            try:
                click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                print(f"    [5/5] ready for next subject.", flush=True)
            except TimeoutException:
                print(f"    [5/5] TIMEOUT clicking new search — may affect next subject.")

    finally:
        _stop_heartbeat.set()
        try:
            driver.quit()
        except Exception:
            pass

    # Final output already written by save_session after every subject, but save again to be explicit
    save_session(results)

    total = len(results)
    with_credits = sum(1 for row in results.values() if row.get("credits") is not None)
    print(f"\nDone. {total} courses written to course_credits.json")
    print(f"  {with_credits} with credits  |  {total - with_credits} null (variable/missing)")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", help="Single subject code, e.g. COMPSCI")
    parser.add_argument("--term", help='Specific term, e.g. "Spring 2025" (default: most recent)')
    parser.add_argument("--force", action="store_true", help="Re-scrape subjects already in session")
    parser.add_argument("--log", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    # configure logging early so debug info is available during navigation
    setup_logging(debug=args.log)

    scrape(term_filter=args.term, subject_filter=args.subject, force=args.force)
