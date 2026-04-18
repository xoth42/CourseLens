"""
push_colleges.py — Load college→subject mapping into Supabase.

Reads out/subject_colleges.json (produced by scrape_colleges.py) and
upserts into two new tables:
  - colleges        (id, name)
  - subject_colleges (subject, college_id)  — one row per subject-college pair
                                              (subjects can appear in multiple colleges)

Prerequisites:
  1. Run scrape_colleges.py first to produce out/subject_colleges.json
  2. Create the tables in Supabase SQL editor (SQL in COLLEGE_FILTER_PLAN.md):
       CREATE TABLE colleges (
         id   SERIAL PRIMARY KEY,
         name VARCHAR NOT NULL UNIQUE
       );
       CREATE TABLE subject_colleges (
         subject    VARCHAR NOT NULL,
         college_id INTEGER NOT NULL REFERENCES colleges(id),
         PRIMARY KEY (subject, college_id)
       );
       CREATE INDEX idx_subject_colleges_college ON subject_colleges(college_id);
       -- RLS: enable read access for anon key
       ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
       ALTER TABLE subject_colleges ENABLE ROW LEVEL SECURITY;
       CREATE POLICY "Public read" ON colleges FOR SELECT USING (true);
       CREATE POLICY "Public read" ON subject_colleges FOR SELECT USING (true);

Usage:
    python push_colleges.py --dry-run    # preview what would be pushed
    python push_colleges.py              # write to Supabase
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

OUT_DIR = Path(__file__).parent / "out"
INPUT_FILE = OUT_DIR / "subject_colleges.json"


def load_mapping() -> list[dict]:
    if not INPUT_FILE.exists():
        print(f"ERROR: {INPUT_FILE} not found. Run scrape_colleges.py first.")
        sys.exit(1)
    rows = []
    with open(INPUT_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    print(f"Loaded {len(rows)} subject→college mappings.")
    return rows


def supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)
    return create_client(url, key)


def push(dry_run: bool):
    rows = load_mapping()

    # Collect unique college names (skip "Other" — it's a placeholder)
    college_names = sorted({r["college"] for r in rows if r["college"] != "Other"})
    print(f"Unique colleges: {len(college_names)}")
    for name in college_names:
        print(f"  {name}")

    if dry_run:
        print("\n[DRY RUN] Would upsert colleges and subject_colleges — no writes performed.")
        print(f"\nSample subject_colleges rows:")
        for r in rows[:10]:
            print(f"  subject={r['subject']} → college={r['college']}")
        return

    sb = supabase_client()

    # Phase 1: upsert colleges
    print(f"\n[Phase 1] Upserting {len(college_names)} colleges...")
    sb.table("colleges").upsert(
        [{"name": name} for name in college_names],
        on_conflict="name"
    ).execute()
    print("  Done.")

    # Fetch id map
    result = sb.table("colleges").select("id, name").execute()
    name_to_id = {row["name"]: row["id"] for row in result.data}
    print(f"  {len(name_to_id)} colleges in table.")

    # Phase 2: upsert subject_colleges
    # Skip "Other" entries — those can be sorted out later
    other_subjects = [r["subject"] for r in rows if r["college"] == "Other"]
    if other_subjects:
        print(f"\n  Skipping {len(other_subjects)} 'Other' subjects (no college assigned):")
        print(f"  {', '.join(sorted(other_subjects))}")

    link_rows = []
    for r in rows:
        if r["college"] == "Other":
            continue
        college_id = name_to_id.get(r["college"])
        if not college_id:
            print(f"  WARNING: college not found in DB: {r['college']!r} (subject={r['subject']})")
            continue
        link_rows.append({"subject": r["subject"], "college_id": college_id})

    print(f"\n[Phase 2] Upserting {len(link_rows)} subject_colleges links...")
    for i in range(0, len(link_rows), 100):
        batch = link_rows[i : i + 100]
        sb.table("subject_colleges").upsert(
            batch, on_conflict="subject,college_id"
        ).execute()
        print(f"  {min(i + 100, len(link_rows))}/{len(link_rows)}", end="\r")

    print(f"  Done.                    ")
    print("\nAll done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to Supabase")
    args = parser.parse_args()
    push(dry_run=args.dry_run)
