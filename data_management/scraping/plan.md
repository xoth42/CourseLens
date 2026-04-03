# Scraping Plan

## Situation

The Melanson spire-api (spire-api.melanson.dev) is **offline as of Jan 2025** — author graduated
and shut it down. The downloaded repo (`spire-api.melanson.dev/`) is reference material only: it
shows us exactly which DOM element IDs SPIRE uses, how the iframe is structured, how instructors
are parsed from the meeting table. We adapt those patterns into a standalone script with no Django.

A pg_dump is available on request (README says open a GitHub issue or email). Worth trying in
parallel, but we don't block on it.

---

## Goal

Produce two JSON files ready for Supabase import:
- `out/courses.json` — one entry per unique course
- `out/sections.json` — one entry per section per term, with instructor name(s)

No ORM, no Django, no database writes yet. Data first, loader second.

---

## Quickest / Dirtiest Route

Single Python file (`scraper.py`) + `requirements.txt`. Selenium + Chrome. Targets one term at a
time (default: most recent). Writes append-mode JSON Lines to `out/`.

### Why not run the Django project locally?

The spire-api requires a Postgres DB, Django setup, migrations, and a running Selenium server
(see docker-compose.yaml). That's 30+ minutes of env setup vs. one pip install.

### Why not requests/BeautifulSoup?

SPIRE is PeopleSoft — everything is rendered by JavaScript after page load and the search form
submits via JS callbacks. Requires a real browser session.

---

## File Layout

```
data_management/scraping/
├── spire-api.melanson.dev/   ← reference only, do not modify
├── plan.md                   ← this file
├── requirements.txt
├── scraper.py                ← single-file Selenium scraper
└── out/
    ├── courses.json
    └── sections.json
```

---

## SPIRE DOM Map (extracted from reference source)

| Purpose              | Selector                                        |
|----------------------|-------------------------------------------------|
| iframe               | `name="TargetContent"`                          |
| Term dropdown        | `id="UM_DERIVED_SA_UM_TERM_DESCR"`              |
| Subject dropdown     | `id="CLASS_SRCH_WRK2_SUBJECT$108$"`             |
| Catalog # input      | `id="CLASS_SRCH_WRK2_CATALOG_NBR$8$"`           |
| Open only checkbox   | `id="CLASS_SRCH_WRK2_SSR_OPEN_ONLY"`            |
| Search button        | `id="CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH"`        |
| New search button    | `id="CLASS_SRCH_WRK2_SSR_PB_NEW_SEARCH"`        |
| SPIRE idle signal    | `body.PSPAGE` style attr — wait until NOT "none"|
| Course group spans   | `span[id^=DERIVED_CLSRCH_DESCR200]`             |
| Instructor divs      | `div[id^=win0divUM_DERIVED_SR_UM_HTML1`          |

Course span text format: `"COMPSCI 320 Software Engineering"`
Term option text format (swapped from SPIRE): `"2025 Spring"` → stored as `"Spring 2025"`

---

## Phases (all in scraper.py for now)

1. **Boot** — launch headless Chrome, navigate to SPIRE, switch into TargetContent iframe
2. **Discover** — read term and subject dropdowns, pick target term
3. **Per-subject loop** — for each subject:
   a. Set term + subject dropdowns, clear open-only filter, send catalog # >= "A"
   b. Click search, wait for results
   c. Parse course spans → extract subject, number, title
   d. Parse instructor divs → extract instructor names per course group
   e. Append to `out/courses.json` and `out/sections.json`
   f. Click "new search", loop
4. **Output** — JSON Lines, one object per line, for easy streaming into Supabase later

---

## What We Are NOT Doing Yet

- Navigating into individual section detail pages (too slow for a first pass)
- Prerequisites (separate scrape, harder)
- Supabase inserts (loader script comes after data is validated)
- Credits / description (course catalog is no longer a public page per the README)
- All terms (start with one, expand later)
