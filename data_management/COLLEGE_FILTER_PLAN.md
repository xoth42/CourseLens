# Implementation Plan: College-Based Course Filtering

## Problem

The department filter on the Browse Courses page lists 136 raw subject codes
(ACCOUNTG, AFROAM, ANIMLSCI, ...) in a single dropdown. This is unusable.
The fix: add a college (school) level above departments, so users drill down
college → department → classes.

---

## What We Know

### Current DB Structure (confirmed via curl, 2026-04-12)

```
classes (4686 rows)
  id, course_number, subject, name, description*, credits*,
  classavg, difficulty_avg, review_count
  (*always NULL — not scraped yet)

professor (1597 rows) | professor_classes (706 rows)
evaluations/prerequisites/flags — all empty
course_metrics — VIEW returning: id, code, name, department, professor,
                 rating, difficulty, reviews, avg_gpa
```

**No colleges table exists.** The `subject` column (e.g. "COMPSCI") is the only
department-level grouping.

### What the spire-api Reference Project Already Has

`data_management/scraping/spire-api.melanson.dev/` contains a fully-built
Django scraper that scraped UMass SPIRE. It modeled:

- `AcademicGroup` — the college/school (e.g. "Manning College of Information
  & Computer Sciences")
- `Subject` — department code (e.g. "COMPSCI") with a ManyToMany → AcademicGroup

The `raw_academic_group.py` file shows SPIRE's abbreviated names mapped to
canonical names:

| SPIRE Abbreviation           | Canonical Name                                       |
|------------------------------|------------------------------------------------------|
| College of Info & Computer Sci | Manning College of Information & Computer Sciences |
| College of Humanities&Fine Art | College of Humanities & Fine Arts                  |
| College of Social & Behav. Sci | College of Social & Behavioral Sciences            |
| College of Natural Sci. & Math | College of Natural Sciences                        |
| School of Pub Hlth & Hlth Sci  | School of Public Health & Health Sciences          |
| School of Education            | College of Education                               |
| School of Management           | Isenberg School of Management                      |
| Commonwealth College           | Commonwealth Honors College                        |
| Stockbridge School             | Stockbridge School of Agriculture                  |
| (also: College of Engineering — not in overrides, used as-is from SPIRE) |

The `academic_group` field is scraped from SPIRE course detail pages under
"Course Detail → Academic Group". The current CourseLens scraper (scraper.py)
does NOT visit course detail pages — it only scrapes the Class Search results,
which don't show the Academic Group field.

---

## The Gap

We need: **subject code → college name** mapping for all 136 subjects.

This data lives in SPIRE's Course Catalog (not Class Search). Each course's
detail page has "Academic Group: College of Natural Sciences" etc. The
spire-api project scraped this via the catalog (spire_catalog.py), but our
scraper.py only uses Class Search.

---

## Implementation Plan

### Phase 1 — Build the Subject→College Mapping (Data)

**Option A (Recommended for speed): Static JSON hardcode**

Create `data_management/scraping/out/subject_colleges.json` as a hand-crafted
mapping of all 136 subject codes to their college. The spire-api reference
data + UMass website are sufficient to do this without running Selenium again.

Rough mapping (needs verification against SPIRE):

```
Manning CICS:            COMPSCI, CICS, INFO, DACSS
Engineering:             AEROSPAC, BMED-ENG, CE-ENGIN, CHEM-ENG, E&C-ENG,
                         ENGIN, M&I-ENG, MS-ENG, POLYMER
Natural Sciences:        ASTRON, BIOCHEM, BIOLOGY, BIOSTATS, CHEM, GEO-SCI,
                         GEOLOGY, MATH, MICROBIO, MOLCLBIO, NATSCI, NEUROS&B,
                         ORG&EVBI, PHYSICS, PLANTBIO, STATISTC
Social & Behavioral Sci: AFROAM, ANTHRO, ASIAN-ST, COMM, ECON, EURO, GEOGRAPH,
                         HISTORY, JUDAIC, LABOR, LINGUIST, MIDEAST, POLISCI,
                         PSYCH, SOCBEHAV, SOCIOL, STPEC, WGSS
Humanities & Fine Arts:  ARABIC, ART, ART-HIST, CATALAN, CHINESE, CLASSICS,
                         COMP-LIT, DANCE, ECO, ENGLISH, FILM-ST, FORLANGC,
                         FRENCHED, FRENCHST, GERMAN, GREEK, HEBREW, HISPAN,
                         HM&FNART, ITALIAN, JAPANESE, JUDAIC*, KOREAN, LATIN,
                         LATIN-ED, LLC, LLAMS, LLESL, LLLAN, LLMUS, LLSC,
                         LLSTU, MUSIC, MUSIC-ED, MUSICAPP, PHIL, POLISH,
                         PORTUG, RUSSIAN, SPANISH, THEATER
Isenberg Management:     ACCOUNTG, FINANCE, HT-MGT, MANAGMNT, MARKETNG,
                         OIM, SCH-MGT, SPORTMGT
Public Health:           EHS, EPI, HPP, KIN, NURSING, NUTRITN, PUBHLTH,
                         SLHS, SPHHS
Education:               ART-ED, EDUC, HUMANDEV, SCHPSYCH
Stockbridge Agriculture: ANIMLSCI, ENVIRSCI, FOOD-SCI, LANDARCH, LANDCONT,
                         NRC, RES-ECON, STOCKSCH, SUSTCOMM
Special/Cross-cutting:   BDIC, BCT, ESL, GRADSCH, HONORS, ICONS, JOURNAL,
                         LEGAL, MILITARY, REGIONPL, SRVCLRNG, SPP, UMA-XCHG,
                         UMASS, UNIVRSTY, UWW, ARTS-EXT
```

**Option B (More accurate): Scrape from SPIRE catalog**

Extend scraper.py (or write a new catalog_scraper.py) to:
1. Navigate to SPIRE Course Catalog (separate from Class Search)
2. For each subject, click through to one course's detail page
3. Read "Academic Group" field from the Course Detail table
4. Write to subject_colleges.json

This is what spire_catalog.py in the reference project does. Estimated time:
30-60 min of Selenium runtime (one detail page per subject × 136 subjects).

**Recommendation: Start with Option A**, verify against SPIRE for any
ambiguous subjects, then use Option B only if accuracy becomes critical.

---

### Phase 2 — Supabase Schema Changes

Run these SQL migrations in the Supabase SQL editor:

```sql
-- Table 1: colleges (the school/college level)
CREATE TABLE colleges (
  id   SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE   -- e.g. "Manning College of Information & Computer Sciences"
);

-- Table 2: subject_colleges (maps subject codes → colleges, many-to-one in practice)
-- Kept as a join table (not a column on classes) so:
--   1) subjects that span colleges (e.g. BDIC) can have multiple
--   2) no need to update 4686 class rows — just 136 subject rows
CREATE TABLE subject_colleges (
  subject    VARCHAR NOT NULL,            -- matches classes.subject
  college_id INTEGER NOT NULL REFERENCES colleges(id),
  PRIMARY KEY (subject, college_id)
);

-- Index for frontend queries (filter classes by college)
CREATE INDEX idx_subject_colleges_college ON subject_colleges(college_id);
```

No changes needed to the existing `classes` table.

---

### Phase 3 — Push Script

Write `data_management/scraping/push_colleges.py`:

```
Input:  data_management/scraping/out/subject_colleges.json
        (format: [{"subject": "COMPSCI", "college": "Manning College of ..."}])

Steps:
  1. Read subject_colleges.json
  2. Upsert unique college names → colleges table
  3. Fetch colleges id map (name → id)
  4. Upsert subject/college_id pairs → subject_colleges table
```

Usage:
```bash
python push_colleges.py --dry-run    # preview
python push_colleges.py              # write to Supabase
```

---

### Phase 4 — Update course_metrics View

The existing `course_metrics` view currently returns `department` (= subject code).
Add college info so the frontend can filter without extra joins:

```sql
CREATE OR REPLACE VIEW course_metrics AS
SELECT
  c.id,
  c.course_number        AS code,
  c.name,
  c.subject              AS department,
  c.description,
  agg.professor,
  ...existing aggregations...,
  col.name               AS college        -- NEW
FROM classes c
LEFT JOIN subject_colleges sc ON sc.subject = c.subject
LEFT JOIN colleges col ON col.id = sc.college_id
...rest of existing view...;
```

(Read the existing view definition from Supabase dashboard first.)

---

### Phase 5 — Frontend Changes

**File:** `courselens/frontend/app/courses/page.tsx`

Replace the single department `<select>` with a two-level hierarchy:

```
[College dropdown]  →  [Department dropdown (filtered)]
```

**State:**
```ts
const [college, setCollege] = useState("All");
const [department, setDepartment] = useState("All");
```

**Logic:**
- `colleges` list = distinct `college` values from course_metrics
- When college selected, derive available `departments` from courses filtered to that college
- `filteredCourses` filters on both college (if set) and department (if set)

**UX detail:** When the user selects a college, reset department to "All".

**Approximate dropdown sizes:**
- Colleges: ~10 items (very manageable)
- Departments per college: 5–25 items (vs. current 136 all at once)

---

## File Checklist

| File | Action |
|------|--------|
| `data_management/scraping/out/subject_colleges.json` | CREATE — static mapping |
| `data_management/scraping/push_colleges.py` | CREATE — push script |
| Supabase SQL editor | RUN — colleges + subject_colleges migration |
| Supabase SQL editor | UPDATE — course_metrics view to include college |
| `courselens/frontend/app/courses/page.tsx` | UPDATE — two-level filter UI |

---

## Open Questions

1. **BDIC, HONORS, GRADSCH, UNIVRSTY** — do these belong to a college or appear
   as their own filter category (e.g. "Special Programs")?

2. **Subjects that may span colleges** (e.g. BIOSTATS is used by both Natural
   Sciences and Public Health) — does subject_colleges need multiple rows per
   subject, or do we assign a primary college?

3. **RLS on new tables** — colleges and subject_colleges are read-only public
   data; ensure anon key can SELECT but not INSERT/UPDATE/DELETE.

4. **course_metrics view rebuild** — check what the current view definition is
   before modifying it (pull from Supabase dashboard → Table Editor → Views).
