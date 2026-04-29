-- update_course_metrics_view.sql
-- Phase 4: Add `college` column to course_metrics view.
--
-- Run in Supabase SQL Editor AFTER:
--   1. colleges and subject_colleges tables are populated (Phase 1-3 done)
--
-- Strategy: scalar correlated subquery in SELECT — no GROUP BY change needed,
-- handles subjects that span multiple colleges (picks one alphabetically).
-- Appended at the end so all existing column positions are preserved.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW course_metrics AS
 SELECT cl.id,
    cl.course_number AS code,
    cl.name,
    cl.subject AS department,
    cl.description,
    COALESCE(string_agg(DISTINCT p.name::text, ', '::text), 'TBA'::text) AS professor,
    COALESCE(avg(e.rating), 0::double precision) AS rating,
    COALESCE(avg(e.difficulty), 0::double precision) AS difficulty,
    count(DISTINCT e.id) AS reviews,
    COALESCE(avg(
        CASE e.grade
            WHEN 'A'   THEN 4.0
            WHEN 'A-'  THEN 3.7
            WHEN 'B+'  THEN 3.3
            WHEN 'B'   THEN 3.0
            WHEN 'B-'  THEN 2.7
            WHEN 'C+'  THEN 2.3
            WHEN 'C'   THEN 2.0
            WHEN 'C-'  THEN 1.7
            WHEN 'D+'  THEN 1.3
            WHEN 'D'   THEN 1.0
            ELSE NULL::numeric
        END), 0::numeric) AS avg_gpa,
    -- NEW: college name via scalar subquery (NULL if subject is unmapped)
    (
        SELECT col.name
        FROM subject_colleges sc
        JOIN colleges col ON col.id = sc.college_id
        WHERE sc.subject = cl.subject
        ORDER BY col.name
        LIMIT 1
    ) AS college
   FROM classes cl
     LEFT JOIN professor_classes pc ON pc.class_id = cl.id
     LEFT JOIN professor p ON p.id = pc.prof_id
     LEFT JOIN course_evaluations e ON e.course_id = cl.id
  GROUP BY cl.id, cl.course_number, cl.name, cl.subject, cl.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify: sample a few rows to confirm college is populated
-- ─────────────────────────────────────────────────────────────────────────────
SELECT department, college, code
FROM course_metrics
WHERE department IN ('COMPSCI', 'ACCOUNTG', 'PHYSICS', 'NURSING', 'EDUC')
ORDER BY department, code
LIMIT 10;

-- Also check how many courses still have NULL college (unmapped subjects)
SELECT COUNT(*) AS unmapped_courses
FROM course_metrics
WHERE college IS NULL;
