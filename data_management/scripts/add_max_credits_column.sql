-- add_max_credits_column.sql
-- Add max_credits column to classes table to store the upper bound of credit ranges.
--
-- For courses with fixed credits:    credits=3,     max_credits=NULL
-- For courses with credit ranges:    credits=1,     max_credits=6  (from raw "1-6")
--
-- Run this BEFORE updating course_metrics view.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.classes
ADD COLUMN max_credits integer;

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'classes'
ORDER BY ordinal_position;
