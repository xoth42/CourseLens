"""
push_to_supabase.py — load scraped JSON into Supabase

Reads out/courses.json and out/sections.json produced by scraper.py and
upserts them into the classes, professor, and professor_classes tables.
Tracks what has been pushed in out/push_status.json.

Usage:
    cp .env.example .env
    python push_to_supabase.py --sync-status          # query Supabase, write push_status.json
    python push_to_supabase.py --dry-run              # preview what would be pushed
    python push_to_supabase.py --simple-run           # push one row each to verify schema
    python push_to_supabase.py                        # push all unpushed terms
    python push_to_supabase.py --force-push           # re-push terms already in push_status
"""

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

OUT_DIR = Path(__file__).parent / "out"
COURSES_FILE = OUT_DIR / "courses.json"
SECTIONS_FILE = OUT_DIR / "sections.json"
PUSH_STATUS_FILE = OUT_DIR / "push_status.json"

BATCH_SIZE = 100


# ---------------------------------------------------------------------------
# Push status — tracks what terms have been pushed to Supabase
# ---------------------------------------------------------------------------

def load_push_status() -> dict:
    if not PUSH_STATUS_FILE.exists():
        return {"pushed_terms": {}}
    with open(PUSH_STATUS_FILE) as f:
        return json.load(f)


def save_push_status(status: dict):
    with open(PUSH_STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)


def sync_status_from_supabase(sb: Client):
    """Query Supabase for current state and write push_status.json."""
    print("Querying Supabase for current state...")

    courses_count = sb.table("classes").select("id", count="exact").execute().count
    professors_count = sb.table("professor").select("id", count="exact").execute().count

    # Pull all professor_classes rows to compute per-term stats
    pc_rows = sb.table("professor_classes").select("semester, class_id, prof_id").execute().data

    # Aggregate per semester
    by_term: dict[str, dict] = {}
    for row in pc_rows:
        sem = row["semester"]
        if sem not in by_term:
            by_term[sem] = {"class_ids": set(), "prof_ids": set(), "links": 0}
        by_term[sem]["class_ids"].add(row["class_id"])
        by_term[sem]["prof_ids"].add(row["prof_id"])
        by_term[sem]["links"] += 1

    pushed_terms = {
        sem: {
            "pushed_at": "pre-status-tracking",
            "professor_classes": d["links"],
            "unique_courses_linked": len(d["class_ids"]),
            "unique_professors_linked": len(d["prof_ids"]),
        }
        for sem, d in by_term.items()
    }

    # Global coverage stats
    all_linked_courses = {row["class_id"] for row in pc_rows}
    all_linked_profs = {row["prof_id"] for row in pc_rows}

    status = {
        "pushed_terms": pushed_terms,
        "total_courses_in_db": courses_count,
        "total_professors_in_db": professors_count,
        "courses_with_any_professor": len(all_linked_courses),
        "courses_staff_only": courses_count - len(all_linked_courses),
        "professors_with_any_link": len(all_linked_profs),
        "last_synced": str(date.today()),
    }

    save_push_status(status)

    print(f"  {courses_count} courses in DB "
          f"({len(all_linked_courses)} have a professor link, "
          f"{courses_count - len(all_linked_courses)} are staff-only)")
    print(f"  {professors_count} professors in DB "
          f"({len(all_linked_profs)} have at least one link)")
    print(f"  {len(pushed_terms)} terms:")
    for sem in sorted(pushed_terms):
        d = pushed_terms[sem]
        print(f"    {sem}: {d['professor_classes']} links | "
              f"{d['unique_courses_linked']} courses | "
              f"{d['unique_professors_linked']} professors")
    print(f"\nWrote {PUSH_STATUS_FILE}")


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
        }
        for c in courses
    ]

    if dry_run:
        print(f"  DRY RUN — would upsert {len(rows)} rows")
        for r in rows[:5]:
            print(f"    {r}")
        if len(rows) > 5:
            print(f"    ... and {len(rows) - 5} more")
        return len(rows)

    inserted = 0
    for batch in batched(rows, BATCH_SIZE):
        sb.table("classes").upsert(batch, on_conflict="course_number").execute()
        inserted += len(batch)
        print(f"  {inserted}/{len(rows)}", end="\r")

    print(f"  Done. {len(rows)} courses upserted.          ")
    return len(rows)


# ---------------------------------------------------------------------------
# Phase 2 — upsert professors
# ---------------------------------------------------------------------------

def push_professors(sb: Client, sections: list[dict], dry_run: bool) -> dict[str, int]:
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
) -> dict[str, int]:
    """Returns semester -> professor_classes count for status tracking."""
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
        return {}

    inserted = 0
    for batch in batched(unique_rows, BATCH_SIZE):
        sb.table("professor_classes").upsert(
            batch, on_conflict="prof_id,class_id,semester"
        ).execute()
        inserted += len(batch)
        print(f"  {inserted}/{len(unique_rows)}", end="\r")

    print(f"  Done. {len(unique_rows)} professor_classes rows upserted.     ")

    # Build per-term stats for status file
    by_term: dict[str, dict] = {}
    for r in unique_rows:
        sem = r["semester"]
        if sem not in by_term:
            by_term[sem] = {"class_ids": set(), "prof_ids": set(), "links": 0}
        by_term[sem]["class_ids"].add(r["class_id"])
        by_term[sem]["prof_ids"].add(r["prof_id"])
        by_term[sem]["links"] += 1

    return {
        sem: {
            "professor_classes": d["links"],
            "unique_courses_linked": len(d["class_ids"]),
            "unique_professors_linked": len(d["prof_ids"]),
        }
        for sem, d in by_term.items()
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main(dry_run: bool, simple_run: bool, force_push: bool):
    status = load_push_status()
    already_pushed = set(status.get("pushed_terms", {}).keys())

    courses = load_jsonl(COURSES_FILE)
    sections = load_jsonl(SECTIONS_FILE)

    if simple_run:
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
    else:
        # Filter sections to only unpushed terms
        all_terms = {s["semester"] for s in sections}
        new_terms = all_terms - already_pushed if not force_push else all_terms
        skipped_terms = all_terms - new_terms

        if skipped_terms:
            print(f"Skipping {len(skipped_terms)} already-pushed term(s): {sorted(skipped_terms)}")
            print(f"  Use --force-push to re-push them.")

        if not new_terms:
            print("Nothing new to push. All terms already in push_status.json.")
            print("Run --sync-status to verify DB state, or --force-push to re-push anyway.")
            return

        sections = [s for s in sections if s["semester"] in new_terms]
        print(f"Pushing {len(new_terms)} new term(s): {sorted(new_terms)}")

    print(f"Loaded {len(courses)} courses, {len(sections)} section records.")

    sb = None if dry_run else supabase_client()

    push_courses(sb, courses, dry_run)
    name_to_id = push_professors(sb, sections, dry_run)

    course_number_to_id: dict[str, int] = {}
    if not dry_run:
        result = sb.table("classes").select("id, course_number").execute()
        course_number_to_id = {row["course_number"]: row["id"] for row in result.data}

    semester_counts = push_professor_classes(sb, sections, name_to_id, course_number_to_id, dry_run)

    # Update push_status.json (skip for dry-run and simple-run)
    if not dry_run and not simple_run and semester_counts:
        for sem, stats in semester_counts.items():
            status["pushed_terms"][sem] = {
                "pushed_at": str(date.today()),
                **stats,
            }
        # Refresh global totals from DB
        total_courses = sb.table("classes").select("id", count="exact").execute().count
        total_professors = sb.table("professor").select("id", count="exact").execute().count
        pc_rows = sb.table("professor_classes").select("class_id, prof_id").execute().data
        status["total_courses_in_db"] = total_courses
        status["total_professors_in_db"] = total_professors
        status["courses_with_any_professor"] = len({r["class_id"] for r in pc_rows})
        status["courses_staff_only"] = total_courses - status["courses_with_any_professor"]
        status["professors_with_any_link"] = len({r["prof_id"] for r in pc_rows})
        status["last_synced"] = str(date.today())
        save_push_status(status)
        print(f"\nUpdated push_status.json — {len(status['pushed_terms'])} total terms pushed.")

    print("\nAll done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sync-status", action="store_true",
                        help="Query Supabase and write current state to push_status.json")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be inserted without writing to Supabase")
    parser.add_argument("--simple-run", action="store_true",
                        help="Push one row of each type to verify the schema")
    parser.add_argument("--force-push", action="store_true",
                        help="Re-push terms already recorded in push_status.json")
    args = parser.parse_args()

    if args.sync_status:
        sync_status_from_supabase(supabase_client())
    else:
        main(dry_run=args.dry_run, simple_run=args.simple_run, force_push=args.force_push)
