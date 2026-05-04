"""
push_credits.py — Update 'credits' and 'max_credits' columns in the classes table.

Reads out/course_credits.json (produced by scrape_credits.py) and does a
targeted UPDATE on each row in classes WHERE course_number matches.
- credits: fixed credit value (or lower bound for ranges)
- max_credits: upper bound for credit ranges (NULL for fixed credits)

Usage:
    python push_credits.py --dry-run   # preview counts, no writes
    python push_credits.py             # update credits where currently NULL
    python push_credits.py --force     # overwrite even if credits already set
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

CREDITS_FILE = Path(__file__).parent / "out" / "course_credits.json"
BATCH_SIZE = 100


def supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)
    return create_client(url, key)


def batched(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def main(dry_run: bool, force: bool):
    if not CREDITS_FILE.exists():
        print(f"ERROR: {CREDITS_FILE} not found. Run scrape_credits.py first.")
        sys.exit(1)

    # Load scraped credits and max_credits
    scraped: dict[str, dict] = {}
    with open(CREDITS_FILE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                scraped[row["course_number"]] = {
                    "credits": row.get("credits"),
                    "max_credits": row.get("max_credits"),
                }
            except (json.JSONDecodeError, KeyError):
                pass

    print(f"Loaded {len(scraped)} course_number entries from course_credits.json.")
    null_count = sum(1 for v in scraped.values() if v.get("credits") is None)
    if null_count:
        print(f"  ({null_count} entries have null credits — variable/unknown; will be skipped)")

    # Fetch current DB state
    sb = None if dry_run else supabase_client()

    if dry_run:
        # Estimate: assume all scraped courses exist and none have credits yet
        pushable = sum(1 for v in scraped.values() if v.get("credits") is not None)
        print(f"\nDRY RUN — would update up to {pushable} rows with non-null credits.")
        return

    print("\nFetching current classes from Supabase...")
    result = sb.table("classes").select("id, course_number, credits, max_credits").execute()
    db_rows = {row["course_number"]: row for row in result.data}
    print(f"  {len(db_rows)} classes in DB.")

    # Build update list
    to_update = []
    skipped_null = 0
    skipped_already_set = 0
    not_in_db = 0

    for course_number, row_data in scraped.items():
        credits = row_data.get("credits")
        max_credits = row_data.get("max_credits")

        if credits is None:
            skipped_null += 1
            continue
        db_row = db_rows.get(course_number)
        if db_row is None:
            not_in_db += 1
            continue
        if not force and db_row["credits"] is not None:
            skipped_already_set += 1
            continue
        to_update.append({
            "id": db_row["id"],
            "credits": credits,
            "max_credits": max_credits,
        })

    print(f"\n  To update:        {len(to_update)}")
    print(f"  Skipped (null):   {skipped_null}")
    print(f"  Already set:      {skipped_already_set}  (use --force to overwrite)")
    print(f"  Not in DB:        {not_in_db}")

    if not to_update:
        print("\nNothing to update.")
        return

    # Push in batches — update by id
    print(f"\nUpdating {len(to_update)} rows...")
    updated = 0
    for batch in batched(to_update, BATCH_SIZE):
        for row in batch:
            sb.table("classes").update({
                "credits": row["credits"],
                "max_credits": row["max_credits"],
            }).eq("id", row["id"]).execute()
        updated += len(batch)
        print(f"  {updated}/{len(to_update)}", end="\r")

    print(f"\nDone. {updated} rows updated.")

    # Final coverage report
    result2 = sb.table("classes").select("credits", count="exact").is_("credits", "null").execute()
    still_null = result2.count
    total = len(db_rows)
    print(f"\nDB coverage: {total - still_null}/{total} classes now have credits ({still_null} still null).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to Supabase")
    parser.add_argument("--force", action="store_true", help="Overwrite credits that are already set")
    args = parser.parse_args()

    main(dry_run=args.dry_run, force=args.force)
