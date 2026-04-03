"""
scraper.py — dirty single-file SPIRE scraper
Writes JSON Lines to out/courses.json and out/sections.json.

Usage:
    pip install -r requirements.txt
    python scraper.py                        # scrapes most recent term
    python scraper.py --term "Spring 2025"   # scrapes a specific term
    python scraper.py --subject COMPSCI      # one subject only (for testing)
"""

import argparse
import json
import os
import re
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

SPIRE_URL = "https://www.spire.umass.edu"
OUT_DIR = os.path.join(os.path.dirname(__file__), "out")

# ---------------------------------------------------------------------------
# Driver setup
# ---------------------------------------------------------------------------

def make_driver() -> webdriver.Chrome:
    opts = webdriver.ChromeOptions()
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1920,1080")
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=opts)


# ---------------------------------------------------------------------------
# SPIRE wait / navigation helpers (adapted from spire-api reference)
# ---------------------------------------------------------------------------

TIMEOUT = 120  # seconds — SPIRE is slow

def wait_for_spire(driver: webdriver.Chrome):
    """Wait until SPIRE's loading overlay is gone."""
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


def select_by_value(driver: webdriver.Chrome, element_id: str, value: str):
    el = WebDriverWait(driver, TIMEOUT).until(
        EC.element_to_be_clickable((By.ID, element_id))
    )
    Select(el).select_by_value(value)
    wait_for_spire(driver)


def select_by_text(driver: webdriver.Chrome, element_id: str, text: str):
    el = WebDriverWait(driver, TIMEOUT).until(
        EC.element_to_be_clickable((By.ID, element_id))
    )
    Select(el).select_by_visible_text(text)
    wait_for_spire(driver)


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
    select_by_value(driver, "UM_DERIVED_SA_UM_TERM_DESCR", term_value)
    select_by_value(driver, "CLASS_SRCH_WRK2_SUBJECT$108$", subject_value)

    # Set catalog number filter to >= "A" (catches everything)
    select_by_text(driver, "CLASS_SRCH_WRK2_SSR_EXACT_MATCH1", "greater than or equal to")

    nbr_input = driver.find_element(By.ID, "CLASS_SRCH_WRK2_CATALOG_NBR$8$")
    nbr_input.clear()
    nbr_input.send_keys("0")
    wait_for_spire(driver)

    # Uncheck "open classes only" so we get all sections
    open_only = driver.find_element(By.ID, "CLASS_SRCH_WRK2_SSR_OPEN_ONLY")
    if open_only.is_selected():
        driver.execute_script("arguments[0].click();", open_only)
        wait_for_spire(driver)


# ---------------------------------------------------------------------------
# Main scrape loop
# ---------------------------------------------------------------------------

def scrape(term_filter: str | None, subject_filter: str | None):
    os.makedirs(OUT_DIR, exist_ok=True)
    courses_path = os.path.join(OUT_DIR, "courses.json")
    sections_path = os.path.join(OUT_DIR, "sections.json")

    seen_courses: set[str] = set()
    all_courses: list[dict] = []
    all_sections: list[dict] = []

    driver = make_driver()
    try:
        boot(driver)

        term_options, subject_options = get_options(driver)
        print(f"Found {len(term_options)} terms, {len(subject_options)} subjects.")

        # Pick term
        if term_filter:
            matched = [(v, t) for v, t in term_options if t == term_filter]
            if not matched:
                print(f"ERROR: term {term_filter!r} not found. Available:")
                for _, t in term_options:
                    print(f"  {t}")
                sys.exit(1)
            target_terms = matched
        else:
            # Default: most recent term
            target_terms = [term_options[0]]

        print(f"Target term(s): {[t for _, t in target_terms]}")

        for term_value, term_label in target_terms:
            print(f"\n=== {term_label} ===")

            for subject_value, subject_title in subject_options:
                subject_id = subject_value  # e.g. "COMPSCI"

                if subject_filter and subject_id != subject_filter:
                    continue

                print(f"  Searching {subject_id}...", end=" ", flush=True)

                try:
                    initialize_search(driver, term_value, subject_value)
                    click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH")
                except TimeoutException:
                    print("TIMEOUT on search, skipping.")
                    # Try to get back to search form
                    try:
                        click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                    except Exception:
                        pass
                    continue

                # Check for "no results" error
                error_span = None
                try:
                    error_span = driver.find_element(By.ID, "DERIVED_CLSMSG_ERROR_TEXT")
                except NoSuchElementException:
                    pass

                if error_span:
                    print(f"no results.")
                    try:
                        click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                    except Exception:
                        pass
                    continue

                courses, sections = parse_results(driver, term_label, subject_id)
                print(f"{len(courses)} courses.")

                for c in courses:
                    if c["course_number"] not in seen_courses:
                        seen_courses.add(c["course_number"])
                        all_courses.append(c)

                all_sections.extend(sections)

                try:
                    click_and_wait(driver, "CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH")
                except TimeoutException:
                    print("  WARNING: could not return to new search.")

    finally:
        driver.quit()

    # Write output
    with open(courses_path, "w") as f:
        for c in all_courses:
            f.write(json.dumps(c) + "\n")

    with open(sections_path, "w") as f:
        for s in all_sections:
            f.write(json.dumps(s) + "\n")

    print(f"\nDone. {len(all_courses)} unique courses, {len(all_sections)} section records.")
    print(f"  {courses_path}")
    print(f"  {sections_path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--term", help='e.g. "Spring 2025"')
    parser.add_argument("--subject", help='e.g. COMPSCI — useful for a quick test run')
    args = parser.parse_args()

    scrape(term_filter=args.term, subject_filter=args.subject)
