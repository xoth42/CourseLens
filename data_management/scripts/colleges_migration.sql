-- STEP 1-3 HAVE BEEN RUN

-- colleges_migration.sql
-- Run in Supabase SQL editor (Dashboard → SQL Editor)
-- Execute AFTER scrape_colleges.py + push_colleges.py succeed.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Create colleges table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE colleges (
  id   SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Create subject_colleges join table
-- One row per (subject, college) pair.
-- Most subjects map to exactly one college.
-- Subjects that span colleges (e.g. BIOSTATS) get multiple rows.
-- "Other" subjects are NOT inserted here; they remain unlinked until corrected.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE subject_colleges (
  subject    VARCHAR NOT NULL,
  college_id INTEGER NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  PRIMARY KEY (subject, college_id)
);

CREATE INDEX idx_subject_colleges_college ON subject_colleges(college_id);
CREATE INDEX idx_subject_colleges_subject ON subject_colleges(subject);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Row Level Security — read-only for anon key
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_colleges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read colleges"
  ON colleges FOR SELECT USING (true);

CREATE POLICY "Public read subject_colleges"
  ON subject_colleges FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4 (after push): Verify data loaded correctly
-- ─────────────────────────────────────────────────────────────────────────────

-- Count colleges
SELECT COUNT(*) AS college_count FROM colleges;

-- Count subjects mapped
SELECT COUNT(DISTINCT subject) AS subjects_mapped FROM subject_colleges;

-- Subjects NOT in any college (these are the "Other" ones)
SELECT DISTINCT c.subject
FROM classes c
LEFT JOIN subject_colleges sc ON sc.subject = c.subject
WHERE sc.subject IS NULL
ORDER BY c.subject;

-- College → subject listing
SELECT col.name AS college, array_agg(sc.subject ORDER BY sc.subject) AS subjects
FROM colleges col
JOIN subject_colleges sc ON sc.college_id = col.id
GROUP BY col.name
ORDER BY col.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5 (deferred): Update course_metrics view to include college
-- Do this after verifying the above tables are correct.
-- The current course_metrics view definition must be fetched from the dashboard
-- first before modifying it.
-- ─────────────────────────────────────────────────────────────────────────────

-- PLACEHOLDER — fetch existing view definition first, then extend with:
--
-- LEFT JOIN subject_colleges sc ON sc.subject = c.subject
-- LEFT JOIN colleges col ON col.id = sc.college_id
--
-- and add to SELECT:
-- , col.name AS college
