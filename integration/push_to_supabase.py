"""
Nightly push: Airtable "Monthly Scorecard" row  ->  Supabase studio_trends.

Reads the clean, already-aggregated month row from Airtable (the integration
hand-off point) and writes ONLY the 3 validated-safe fields into studio_trends,
Pewaukee-only and lock-guarded. DRY RUN by default — pass --write to actually write.

Config (environment variables):
  AIRTABLE_TOKEN                Airtable personal access token (read Monthly Scorecard)
  SUPABASE_URL                  e.g. https://qiabgzcephexksvhqdir.supabase.co
  SUPABASE_SERVICE_ROLE_KEY     service-role key (server-side only — never ship to a browser)
Optional:
  MONTH, YEAR                   default = current month
  AIRTABLE_BASE                 default appTQPmbMRZA6sWr5
  STUDIO_ID                     default Pewaukee 3abc6af6-37b8-4c13-b761-a92b5204ca25

Run:
  AIRTABLE_TOKEN=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
    python3 integration/push_to_supabase.py            # dry run, prints the patch
  …same… python3 integration/push_to_supabase.py --write   # actually writes
"""
import os
import sys
import json
import datetime
import urllib.request
import urllib.parse

BASE   = os.environ.get("AIRTABLE_BASE", "appTQPmbMRZA6sWr5")
TABLE  = "Monthly Scorecard"
STUDIO = os.environ.get("STUDIO_ID", "3abc6af6-37b8-4c13-b761-a92b5204ca25")  # Pewaukee ONLY

# Airtable "Monthly Scorecard" field  ->  studio_trends column. SAFE fields only.
# Blocked fields (retail, cancellations, new_members) are intentionally omitted until
# their definitions are resolved — see HOTWORX_Integration_Handoff.md / README.
SAFE_MAP = {
    "Membership Cash": "membership_cash",
    "Total Members":   "total_member_count",
    "Lost MRR":        "eft_decrease",
}


def _get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def read_scorecard(token, month_str):
    """Find the Monthly Scorecard row whose Month == 'YYYY-MM'."""
    url = f"https://api.airtable.com/v0/{BASE}/{urllib.parse.quote(TABLE)}"
    data = _get(url, token)
    for rec in data.get("records", []):
        if str(rec["fields"].get("Month", "")).strip() == month_str:
            return rec["fields"]
    return None


def main(write):
    token = os.environ["AIRTABLE_TOKEN"]
    now = datetime.date.today()
    year = int(os.environ.get("YEAR", now.year))
    month = int(os.environ.get("MONTH", now.month))
    month_str = f"{year:04d}-{month:02d}"

    row = read_scorecard(token, month_str)
    if not row:
        print(f"No Monthly Scorecard row for {month_str}. Nothing to push.")
        return

    patch = {col: row[src] for src, col in SAFE_MAP.items() if src in row and row[src] is not None}
    patch["updated_at"] = "now()"

    print(f"Source: Airtable Monthly Scorecard {month_str}")
    print(f"Target: studio_trends  studio_id={STUDIO}  {year}-{month:02d}  (locked=false guard)")
    print("Would set:")
    for k, v in patch.items():
        print(f"   {k:22s} = {v}")

    if not write:
        print("\n[DRY RUN] No write performed. Re-run with --write to apply.")
        return

    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    q = (f"{url}/rest/v1/studio_trends?studio_id=eq.{STUDIO}"
         f"&year=eq.{year}&month=eq.{month}&locked=eq.false")
    body = json.dumps({k: v for k, v in patch.items() if k != "updated_at"}).encode()
    req = urllib.request.Request(q, data=body, method="PATCH", headers={
        "apikey": key, "Authorization": f"Bearer {key}",
        "Content-Type": "application/json", "Prefer": "return=representation",
    })
    with urllib.request.urlopen(req) as r:
        result = json.load(r)
    if result:
        print("\n✓ Wrote (lock-guarded):", json.dumps(result[0], default=str)[:300])
    else:
        print("\n⚠ 0 rows updated — month row is missing or locked. "
              "Create the studio_trends row first (the app does this on first open).")


if __name__ == "__main__":
    main(write="--write" in sys.argv)
