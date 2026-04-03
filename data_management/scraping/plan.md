# Scraping Plan

## Situation

The Melanson spire-api (spire-api.melanson.dev) is **offline as of Jan 2025** — author graduated
and shut it down. The downloaded repo (`spire-api.melanson.dev/`) is reference material only: it
shows us exactly which DOM element IDs SPIRE uses, how the iframe is structured, how instructors
are parsed from the meeting table. We adapted those patterns into a standalone script with no Django.

A pg_dump is available on request (README says open a GitHub issue or email). Not pursued — the
scraper is working.

---

## Current State

Scraper is operational. Winter 2026 and Spring 2026 are complete and pushed to Supabase.
Multi-term runs with session resume are working. Active run: --years 4 (Fall 2026 in progress).

---

## File Layout

```
data_management/scraping/
├── spire-api.melanson.dev/   ← reference only, do not modify
├── plan.md                   ← this file
├── requirements.txt          ← selenium, webdriver-manager, supabase, python-dotenv
├── .env.example              ← copy to .env, fill in SUPABASE_URL + SUPABASE_KEY
├── USAGE.txt                 ← all run commands and options
├── scraper.py                ← Selenium scraper with session/resume/Ctrl-C
├── push_to_supabase.py       ← loads out/ JSON into Supabase tables
└── out/
    ├── courses.json          ← unique courses (append-mode, one JSON per line)
    ├── sections.json         ← course+semester+instructors (append-mode)
    └── session.json          ← scrape progress tracker (do not delete mid-run)
```

---

## SPIRE DOM Map (extracted from reference source)

| Purpose              | Selector                                         |
|----------------------|--------------------------------------------------|
| iframe               | `name="TargetContent"`                           |
| Term dropdown        | `id="UM_DERIVED_SA_UM_TERM_DESCR"`               |
| Subject dropdown     | `id="CLASS_SRCH_WRK2_SUBJECT$108$"`              |
| Catalog # input      | `id="CLASS_SRCH_WRK2_CATALOG_NBR$8$"`            |
| Open only checkbox   | `id="CLASS_SRCH_WRK2_SSR_OPEN_ONLY"`             |
| Search button        | `id="CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH"`         |
| New search button    | `id="CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH"`         |
| SPIRE idle signal    | `body.PSPAGE` style attr — wait until NOT "none" |
| Course group spans   | `span[id^=DERIVED_CLSRCH_DESCR200]`              |
| Instructor divs      | `div[id^=win0divUM_DERIVED_SR_UM_HTML1`           |

Course span text format: `"COMPSCI 320 Software Engineering"`
Term option text format (swapped from SPIRE): `"2025 Spring"` → stored as `"Spring 2025"`

---

## How the Scraper Works

1. **Boot** — launch Chrome (visible window, SPIRE requires a real session), navigate to SPIRE,
   switch into TargetContent iframe
2. **Session load** — reads `out/session.json` to find completed terms and partially-done subjects;
   reads existing `out/courses.json` and `out/sections.json` to avoid duplicate writes
3. **Term/subject loop** — for each target term, for each subject:
   - Skip if already in session
   - Set dropdowns, disable open-only filter, search
   - Parse course spans → subject, number, title
   - Parse instructor divs → instructor names per course group
   - Append results to disk, record subject in session immediately
4. **Ctrl-C handling** — finishes current subject, saves session, exits. Second Ctrl-C force-quits.

---

## Push Pipeline

scraper.py → out/courses.json + out/sections.json → push_to_supabase.py → Supabase

Phase 1: upsert `classes` on `course_number`
Phase 2: upsert `professor` on `name`; fetch back generated IDs
Phase 3: upsert `professor_classes` (prof_id, class_id, semester) using resolved IDs

---

## What Is Not Done Yet

- Prerequisites (separate scrape — requires navigating course detail pages)
- Credits / description (SPIRE catalog is no longer a public page per the README)
- Instructor email capture (available via mailto links; currently name-only)
- Per-section instructor granularity (currently one instructor list per course group, not per section)
- Scheduled / automated re-scrape (manual for now)
