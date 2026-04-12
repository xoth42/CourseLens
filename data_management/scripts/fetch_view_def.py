"""
fetch_view_def.py — Print the current course_metrics view definition from Supabase.

Uses the Supabase Python client with the service key to access pg_catalog.pg_views,
which is not exposed through the REST API to anonymous callers.

Usage:
    cd data_management/scraping
    python ../scripts/fetch_view_def.py

Output: prints the raw SQL definition of course_metrics to stdout.
"""

import os, sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env from scraping/ (where SUPABASE_URL and SUPABASE_KEY live)
load_dotenv(Path(__file__).parent.parent / "scraping" / ".env")

try:
    from supabase import create_client
except ImportError:
    print("ERROR: supabase package not installed. Run: pip install supabase", file=sys.stderr)
    sys.exit(1)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
if not url or not key:
    print("ERROR: SUPABASE_URL / SUPABASE_KEY not set in .env", file=sys.stderr)
    sys.exit(1)

sb = create_client(url, key)

# pg_catalog.pg_views is accessible by switching the PostgREST schema header.
# The service key bypasses RLS; pg_catalog is readable by any superuser-equivalent.
try:
    result = (
        sb.schema("pg_catalog")
        .from_("pg_views")
        .select("viewname, definition")
        .eq("schemaname", "public")
        .eq("viewname", "course_metrics")
        .execute()
    )
    if result.data:
        row = result.data[0]
        print(f"-- View: {row['viewname']}")
        print("-- Definition:")
        print(row["definition"])
    else:
        print("No view named 'course_metrics' found in public schema.", file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f"ERROR fetching view definition: {e}", file=sys.stderr)
    sys.exit(1)
