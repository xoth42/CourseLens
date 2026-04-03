"""
push_to_supabase.py — load scraped JSON into Supabase

Reads out/courses.json and out/sections.json produced by scraper.py and
upserts them into the classes, professor, and professor_classes tables.

Usage:
    cp .env.example .env        # fill in SUPABASE_URL and SUPABASE_KEY
    pip install -r requirements.txt
    python push_to_supabase.py
    python push_to_supabase.py --dry-run   # print what would be inserted, no writes
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
COURSES_FILE = OUT_DIR / "courses.json"
SECTIONS_FILE = OUT_DIR / "sections.json"

BATCH_SIZE = 100  # rows per upsert call


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        print(f"ERROR: {path} not found. Run scraper.py first.")
        sys.exit(1)
    rows = []
    skipped = 0
    with open(path) as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                print(f"  WARNING: skipping malformed line {i} in {path.name}: {line[:60]!r}")
                skipped += 1
    if skipped:
        print(f"  Skipped {skipped} malformed lines in {path.name}.")
    return rows


def batched(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Phase 1 — upsert classes
# ---------------------------------------------------------------------------

def push_courses(sb: Client, courses: list[dict], dry_run: bool):
    print(f"\n[Phase 1] Upserting {len(courses)} courses into classes...")

    rows = [
        {
            "course_number": c["course_number"],
            "subject": c["subject"],
            "name": c["name"],
            # classavg, difficulty_avg default NULL — no ratings yet
            # review_count defaults to 0 — no reviews yet
        }
        for c in courses
    ]

    if dry_run:
        print(f"  DRY RUN — would upsert {len(rows)} rows")
        for r in rows[:5]:
            print(f"    {r}")
        if len(rows) > 5:
            print(f"    ... and {len(rows) - 5} more")
        return

    inserted = 0
    for batch in batched(rows, BATCH_SIZE):
        sb.table("classes").upsert(batch, on_conflict="course_number").execute()
        inserted += len(batch)
        print(f"  {inserted}/{len(rows)}", end="\r")

    print(f"  Done. {len(rows)} courses upserted.          ")


# ---------------------------------------------------------------------------
# Phase 2 — upsert professors
# ---------------------------------------------------------------------------

def push_professors(sb: Client, sections: list[dict], dry_run: bool) -> dict[str, int]:
    """Upsert all unique instructor names. Returns name -> id map."""

    all_names: set[str] = set()
    for s in sections:
        for name in s["instructors"]:
            if name and name != "Staff":
                all_names.add(name)

    rows = [{"name": name} for name in sorted(all_names)]
    print(f"\n[Phase 2] Upserting {len(rows)} professors into professor...")

    if dry_run:
        print(f"  DRY RUN — would upsert {len(rows)} rows")
        for r in rows[:5]:
            print(f"    {r}")
        if len(rows) > 5:
            print(f"    ... and {len(rows) - 5} more")
        return {}

    for batch in batched(rows, BATCH_SIZE):
        sb.table("professor").upsert(batch, on_conflict="name").execute()

    # Fetch back all professors to build name -> id map
    result = sb.table("professor").select("id, name").execute()
    name_to_id = {row["name"]: row["id"] for row in result.data}
    print(f"  Done. {len(name_to_id)} professors in table.")
    return name_to_id


# ---------------------------------------------------------------------------
# Phase 3 — upsert professor_classes
# ---------------------------------------------------------------------------

def push_professor_classes(
    sb: Client,
    sections: list[dict],
    name_to_id: dict[str, int],
    course_number_to_id: dict[str, int],
    dry_run: bool,
):
    print(f"\n[Phase 3] Building professor_classes links...")

    rows = []
    skipped = 0
    for s in sections:
        class_id = course_number_to_id.get(s["course_number"])
        if not class_id:
            skipped += 1
            continue

        for name in s["instructors"]:
            if name == "Staff" or not name:
                continue
            prof_id = name_to_id.get(name)
            if not prof_id:
                skipped += 1
                continue
            rows.append({
                "prof_id": prof_id,
                "class_id": class_id,
                "semester": s["semester"],
            })

    # Deduplicate (same prof can appear in multiple section groups)
    seen = set()
    unique_rows = []
    for r in rows:
        key = (r["prof_id"], r["class_id"], r["semester"])
        if key not in seen:
            seen.add(key)
            unique_rows.append(r)

    print(f"  {len(unique_rows)} unique links to insert ({skipped} skipped).")

    if dry_run:
        print(f"  DRY RUN — would upsert {len(unique_rows)} rows")
        for r in unique_rows[:5]:
            print(f"    {r}")
        return

    inserted = 0
    for batch in batched(unique_rows, BATCH_SIZE):
        sb.table("professor_classes").upsert(
            batch, on_conflict="prof_id,class_id,semester"
        ).execute()
        inserted += len(batch)
        print(f"  {inserted}/{len(unique_rows)}", end="\r")

    print(f"  Done. {len(unique_rows)} professor_classes rows upserted.     ")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main(dry_run: bool, simple_run: bool):
    courses = load_jsonl(COURSES_FILE)
    sections = load_jsonl(SECTIONS_FILE)

    if simple_run:
        # Pick one section that has a named instructor so all three phases have data
        sample_section = next(
            (s for s in sections if s["instructors"] and s["instructors"][0] != "Staff"),
            sections[0],
        )
        sample_course = next(
            (c for c in courses if c["course_number"] == sample_section["course_number"]),
            courses[0],
        )
        courses = [sample_course]
        sections = [sample_section]
        print(f"[simple-run] Using: {sample_course['course_number']} / {sample_section['instructors']}")

    print(f"Loaded {len(courses)} courses, {len(sections)} section records.")

    sb = None if dry_run else supabase_client()

    push_courses(sb, courses, dry_run)

    name_to_id = push_professors(sb, sections, dry_run)

    # Fetch class id map after courses are upserted
    course_number_to_id: dict[str, int] = {}
    if not dry_run:
        result = sb.table("classes").select("id, course_number").execute()
        course_number_to_id = {row["course_number"]: row["id"] for row in result.data}

    push_professor_classes(sb, sections, name_to_id, course_number_to_id, dry_run)

    print("\nAll done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be inserted without writing to Supabase",
    )
    parser.add_argument(
        "--simple-run",
        action="store_true",
        help="Push exactly one course, one professor, and one professor_classes row to verify the schema",
    )
    args = parser.parse_args()
    main(dry_run=args.dry_run, simple_run=args.simple_run)
