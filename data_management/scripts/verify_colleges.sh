#!/usr/bin/env bash
# verify_colleges.sh — Confirm college data is loaded correctly in Supabase.
#
# Checks:
#   1. Row counts for colleges and subject_colleges tables
#   2. Full list of colleges
#   3. Subjects with NO college assignment (unmapped)
#   4. College → subject-list breakdown
#   5. Sample from course_metrics to confirm view still works
#
# Usage: bash data_management/scripts/verify_colleges.sh

SUPABASE_URL="https://ypeyjbjazqosogluefvc.supabase.co"
ANON_KEY="sb_publishable_5qM0ZtKMC_Ev4nMCbIoZRQ_afcpNPdh"

echo "════════════════════════════════════════════════════════════"
echo " CourseLens — College Data Verification"
echo " $(date)"
echo "════════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Count rows in colleges
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ 1. Row counts"
COLLEGE_COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/colleges?select=id&limit=1" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Prefer: count=exact" \
  -I 2>/dev/null | grep -i content-range | awk -F/ '{print $2}' | tr -d '\r ')
echo "   colleges:         ${COLLEGE_COUNT:-ERROR} rows"

SC_COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/subject_colleges?select=subject&limit=1" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Prefer: count=exact" \
  -I 2>/dev/null | grep -i content-range | awk -F/ '{print $2}' | tr -d '\r ')
echo "   subject_colleges: ${SC_COUNT:-ERROR} rows (unique subject→college links)"

# ─────────────────────────────────────────────────────────────────────────────
# 2. List all colleges
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ 2. College names"
curl -s "${SUPABASE_URL}/rest/v1/colleges?select=id,name&order=name" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    for row in data:
        print(f\"   [{row['id']:>2}] {row['name']}\")
else:
    print('   ERROR:', data)
"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Subjects with NO college assignment (gap check)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ 3. Unmapped subjects (classes.subject NOT in subject_colleges)"
python3 - <<'EOF'
import json, urllib.request

SUPABASE_URL = "https://ypeyjbjazqosogluefvc.supabase.co"
ANON_KEY = "sb_publishable_5qM0ZtKMC_Ev4nMCbIoZRQ_afcpNPdh"

def fetch(path):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

all_subjects = set(r["subject"] for r in fetch("classes?select=subject"))
mapped = set(r["subject"] for r in fetch("subject_colleges?select=subject"))
unmapped = sorted(all_subjects - mapped)

if unmapped:
    print(f"   {len(unmapped)} unmapped subject(s):")
    for s in unmapped:
        print(f"     {s}")
else:
    print(f"   All {len(all_subjects)} subjects are mapped.")
EOF

# ─────────────────────────────────────────────────────────────────────────────
# 4. College → subjects breakdown
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ 4. College → subjects breakdown"
python3 - <<'EOF'
import json, urllib.request
from collections import defaultdict

SUPABASE_URL = "https://ypeyjbjazqosogluefvc.supabase.co"
ANON_KEY = "sb_publishable_5qM0ZtKMC_Ev4nMCbIoZRQ_afcpNPdh"

def fetch(path):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

colleges = {r["id"]: r["name"] for r in fetch("colleges?select=id,name")}
links    = fetch("subject_colleges?select=subject,college_id")

by_college = defaultdict(list)
for link in links:
    name = colleges.get(link["college_id"], f"id={link['college_id']}")
    by_college[name].append(link["subject"])

for college_name in sorted(by_college):
    subjects = sorted(by_college[college_name])
    print(f"   {college_name} ({len(subjects)})")
    print(f"     {', '.join(subjects)}")
EOF

# ─────────────────────────────────────────────────────────────────────────────
# 5. Smoke-test course_metrics view (confirm it still works)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ 5. course_metrics view — columns returned"
curl -s "${SUPABASE_URL}/rest/v1/course_metrics?limit=1" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list) and data:
    print('   Columns:', list(data[0].keys()))
    print('   Sample row (COMPSCI):', {k: v for k, v in list(data[0].items())[:5]})
elif isinstance(data, dict) and 'code' in data:
    print('   ERROR accessing view:', data)
else:
    print('   Result:', data)
"

echo ""
echo "════════════════════════════════════════════════════════════"
echo " Done."
echo "════════════════════════════════════════════════════════════"
