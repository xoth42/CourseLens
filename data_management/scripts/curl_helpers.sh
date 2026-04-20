#!/usr/bin/env bash
# curl_helpers.sh — Supabase REST API exploration commands for CourseLens
#
# Usage: source this file or copy individual commands.
# Requires: SUPABASE_URL and ANON_KEY set below (or export them in your shell).
#
# Supabase project: https://ypeyjbjazqosogluefvc.supabase.co
# Anon key is safe for read-only queries. Service key bypasses RLS (backend only).

SUPABASE_URL="https://ypeyjbjazqosogluefvc.supabase.co"
ANON_KEY="sb_publishable_5qM0ZtKMC_Ev4nMCbIoZRQ_afcpNPdh"

# ─────────────────────────────────────────────────────────────────────────────
# 1. COUNT ROWS IN A TABLE (using Prefer: count=exact header)
# ─────────────────────────────────────────────────────────────────────────────
# Result is in Content-Range response header: 0-N/TOTAL
# CONFIRMED WORKING — returns: content-range: 0-0/4686 for classes

curl -s "${SUPABASE_URL}/rest/v1/classes?select=id&limit=1" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Prefer: count=exact" \
  -I 2>/dev/null | grep -i content-range

# ─────────────────────────────────────────────────────────────────────────────
# 2. SAMPLE ROWS FROM classes TABLE
# ─────────────────────────────────────────────────────────────────────────────
# Columns: id, course_number, subject, name, description, credits,
#          classavg, difficulty_avg, review_count
# NOTE: description and credits are NULL for all rows (not scraped yet)
# CONFIRMED WORKING

curl -s "${SUPABASE_URL}/rest/v1/classes?limit=3" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | python3 -m json.tool

# ─────────────────────────────────────────────────────────────────────────────
# 3. GET ALL DISTINCT SUBJECTS (departments) FROM classes
# ─────────────────────────────────────────────────────────────────────────────
# Returns 136 unique subject codes as of 2026-04-12
# CONFIRMED WORKING

curl -s "${SUPABASE_URL}/rest/v1/classes?select=subject&order=subject" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
subjects = sorted(set(r['subject'] for r in data))
print(f'Total rows: {len(data)}')
print(f'Unique subjects: {len(subjects)}')
print(subjects)
"

# ─────────────────────────────────────────────────────────────────────────────
# 4. CHECK IF A TABLE/VIEW EXISTS (try fetching it, look for error)
# ─────────────────────────────────────────────────────────────────────────────
# Use this to probe whether a view like course_metrics exists.
# Returns JSON array (possibly empty) or {"code":"42P01",...} if not found.

curl -s "${SUPABASE_URL}/rest/v1/course_metrics?limit=2" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}"

# ─────────────────────────────────────────────────────────────────────────────
# 5. FILTER BY SUBJECT
# ─────────────────────────────────────────────────────────────────────────────

curl -s "${SUPABASE_URL}/rest/v1/classes?subject=eq.COMPSCI&order=course_number" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'{len(data)} COMPSCI courses')
for r in data[:5]:
    print(r['course_number'], r['name'])
"

# ─────────────────────────────────────────────────────────────────────────────
# 6. GET PROFESSOR TABLE SAMPLE
# ─────────────────────────────────────────────────────────────────────────────

curl -s "${SUPABASE_URL}/rest/v1/professor?limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | python3 -m json.tool

# ─────────────────────────────────────────────────────────────────────────────
# 7. GET professor_classes SAMPLE (join table)
# ─────────────────────────────────────────────────────────────────────────────

curl -s "${SUPABASE_URL}/rest/v1/professor_classes?limit=5&select=prof_id,class_id,semester" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | python3 -m json.tool

# ─────────────────────────────────────────────────────────────────────────────
# 8. COUNT ROWS IN OTHER TABLES
# ─────────────────────────────────────────────────────────────────────────────

for TABLE in professor professor_classes evaluations evaluation_flags prerequisites; do
  COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/${TABLE}?select=*&limit=1" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -H "Prefer: count=exact" \
    -I 2>/dev/null | grep -i content-range | awk -F/ '{print $2}' | tr -d '\r')
  echo "$TABLE: $COUNT rows"
done

# ─────────────────────────────────────────────────────────────────────────────
# 9. SAMPLE course_metrics VIEW (inspect professor aggregation & column types)
# ─────────────────────────────────────────────────────────────────────────────

curl -s "${SUPABASE_URL}/rest/v1/course_metrics?department=eq.COMPSCI&limit=5&select=id,code,department,professor,rating,difficulty,reviews,avg_gpa" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | python3 -m json.tool

# ─────────────────────────────────────────────────────────────────────────────
# 10. VERIFY colleges + subject_colleges tables (run after push_colleges.py)
# ─────────────────────────────────────────────────────────────────────────────
# Full verification: bash data_management/scripts/verify_colleges.sh

# Quick counts:
for TABLE in colleges subject_colleges; do
  COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/${TABLE}?select=*&limit=1" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -H "Prefer: count=exact" \
    -I 2>/dev/null | grep -i content-range | awk -F/ '{print $2}' | tr -d '\r')
  echo "$TABLE: $COUNT rows"
done

# ─────────────────────────────────────────────────────────────────────────────
# CONFIRMED DB STATE (as of 2026-04-12)
# ─────────────────────────────────────────────────────────────────────────────
# classes:            4686 rows, 136 unique subject codes
# professor:          1597 rows
# professor_classes:   706 rows
# evaluations:           0 rows (no student data yet)
# evaluation_flags:      0 rows
# prerequisites:         0 rows
#
# course_metrics VIEW exists and returns:
#   id, code, name, department, description, professor,
#   rating, difficulty, reviews, avg_gpa
#
# PHASE 1-3 COMPLETE (2026-04-12):
# - colleges table:         12 rows (college names)
# - subject_colleges table: 150 rows (subject→college links)
# - 13 subjects still unmapped (mostly subjects with & in name, e.g. E&C-ENG):
#     E&C-ENG, EURO, FRENCHED, HISPAN, HM&FNART, LATIN-ED, LLAMS, LLLAN,
#     LLSTU, M&I-ENG, NEUROS&B, ORG&EVBI, SCHPSYCH
#
# NEXT: Phase 4 — update course_metrics view to include college column
#        Phase 5 — frontend two-level college→department filter
# ─────────────────────────────────────────────────────────────────────────────
