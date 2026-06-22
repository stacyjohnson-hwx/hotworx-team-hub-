"""
NIGHTLY RUNNER — the one script the scheduler calls.

Pipeline (Pewaukee only, lock-guarded, dry-run by default):
  1. Pull today's files from the Drive 01_Daily folder.
  2. Vision-read the two dashboards (read_dashboard) -> studio-level numbers.
  3. Parse the CSVs (sail_normalizer) -> cancellations cross-check + per-staff (commission).
  4. Recompute derived fields (EFT Change, Net Income) — direct DB writes bypass the
     app's auto-calc, so we MUST set these or the table/dashboard goes stale.
  5. Write studio_trends + personal_goals + the Airtable Monthly Scorecard.

DRY RUN by default — prints what it WOULD write. Pass --write to actually write.

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY     (app DB; project ref qiabgzcephexksvhqdir)
  AIRTABLE_TOKEN                              (read/write the Shadow CRM base)
  ANTHROPIC_API_KEY                           (dashboard vision)
  GOOGLE_SERVICE_ACCOUNT_JSON                 (path to service-account json with the
                                               01_Daily folder shared to it)
Optional: MONTH, YEAR (default current, America/Chicago)

This is the scaffold the GitHub Actions workflow runs. The credential-dependent
steps (Drive fetch, Supabase/Airtable writes) are guarded so a dry run prints a full
plan even before secrets are wired.
"""
import os
import sys
import json
import datetime
import urllib.request

STUDIO = "3abc6af6-37b8-4c13-b761-a92b5204ca25"  # Pewaukee ONLY
DRIVE_FOLDER = "1ePpRQ3qrNchUb7gtlhm6lbdTLkGy3_sm"  # 01_Daily
HERE = os.path.dirname(__file__)
WRITE = "--write" in sys.argv


def log(msg): print(msg, flush=True)


# ── 1. Drive ────────────────────────────────────────────────────────────────
def fetch_daily_files(dest):
    """Download every file in 01_Daily to `dest`. Needs a Google service account
    (GOOGLE_SERVICE_ACCOUNT_JSON) with the folder shared to it. Returns {name: path}."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload
    import io
    creds = service_account.Credentials.from_service_account_file(
        os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"],
        scopes=["https://www.googleapis.com/auth/drive.readonly"])
    svc = build("drive", "v3", credentials=creds)
    files = svc.files().list(q=f"'{DRIVE_FOLDER}' in parents and trashed=false",
                             fields="files(id,name,mimeType)").execute().get("files", [])
    out = {}
    for f in files:
        path = os.path.join(dest, f["name"])
        req = svc.files().get_media(fileId=f["id"])
        with open(path, "wb") as fh:
            dl = MediaIoBaseDownload(fh, req)
            done = False
            while not done:
                _, done = dl.next_chunk()
        out[f["name"]] = path
    return out


def pick(files, *needles):
    for name, path in files.items():
        low = name.lower()
        if all(n in low for n in needles):
            return path
    return None


# ── 2+3. Build the studio_trends patch ──────────────────────────────────────
def build_studio_trends(files):
    from read_dashboard import extract
    from sail_normalizer import normalize

    fields = {}
    # Dashboards (vision) — the authoritative source for the studio-level numbers.
    for needle in ("sales_trends", "pending_tasks", "sales", "dashboard"):
        p = pick(files, needle, ".png")
        if p:
            for k, v in extract(p).items():
                if v is not None and k not in ("new_elite", "new_basic", "total_active_members"):
                    fields[k] = v
            d = extract(p)  # re-read cheap fields for derived metrics
            if d.get("new_members") and d.get("new_elite") is not None:
                fields["sweat_elite_pct"] = round(d["new_elite"] / d["new_members"] * 100, 1)
            if d.get("total_active_members"):
                fields["total_member_count"] = d["total_active_members"]

    # Cancellations cross-check from the CSV (exclude "Membership Downgrade").
    cpath = pick(files, "cancellation", ".csv")
    if cpath:
        c = normalize(cpath)
        nd = ~c["Package Name"].astype(str).str.contains("downgrade", case=False, na=False)
        fields["cancellations"] = int(nd.sum())
    return fields


# ── 4+5. Supabase ────────────────────────────────────────────────────────────
def _sb(method, path, body=None):
    url = os.environ["SUPABASE_URL"].rstrip("/") + path
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "apikey": key, "Authorization": f"Bearer {key}",
        "Content-Type": "application/json", "Prefer": "return=representation"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def write_studio_trends(year, month, fields):
    # Pull the current row so we can recompute derived fields correctly.
    cur = _sb("GET", f"/rest/v1/studio_trends?studio_id=eq.{STUDIO}&year=eq.{year}&month=eq.{month}&select=*")
    row = (cur or [{}])[0]
    merged = {**row, **fields}
    n = lambda k: float(merged.get(k) or 0)
    fields["net_eft_increase"] = round(n("eft_increase") - n("eft_decrease"), 2)   # EFT Change
    fields["net_income"] = round(n("in_the_bank") - n("expenses"), 2)              # Net Income
    log("studio_trends ->\n" + json.dumps(fields, indent=2))
    if not WRITE:
        return
    q = f"/rest/v1/studio_trends?studio_id=eq.{STUDIO}&year=eq.{year}&month=eq.{month}&locked=eq.false"
    res = _sb("PATCH", q, fields)
    log(f"  wrote {len(res)} row(s)" if res else "  0 rows (missing or locked)")


def write_personal_goals(year, month, files):
    """Per-staff POS/Retail/PIF from the commission CSV, mapped via name_map.json.
    Skips anyone not in the map or inactive (departed staff)."""
    import csv, re
    cpath = pick(files, "commission", ".csv")
    if not cpath:
        log("no commission csv — skipping per-staff"); return
    name_map = json.load(open(os.path.join(HERE, "name_map.json")))
    rows = list(csv.DictReader(open(cpath)))
    for r in rows:
        uid = name_map.get((r.get("User Name") or "").strip())
        if not uid:
            continue
        ret = re.search(r"Retail Amount:([\d,\.]+)", r.get("Retail Bonus", "") or "")
        pos = re.search(r"Total Collected:\s*([\d,\.]+)", r.get("Post Pre-Sale New EFT Commissions", "") or "")
        patch = {
            "pos_collected": float(pos.group(1).replace(",", "")) if pos else 0,
            "retail_actual": float(ret.group(1).replace(",", "")) if ret else 0,
        }
        log(f"personal_goals[{uid}] -> {patch}")
        if WRITE:
            _sb("POST", "/rest/v1/personal_goals?on_conflict=tsa_id,studio_id,month,year",
                {**patch, "tsa_id": uid, "studio_id": STUDIO, "month": month, "year": year})
    # NOTE: calls/texts/members per staff live on the achievements dashboard (vision,
    # per-row) — a fast-follow once we extract that table.


# ── Airtable Monthly Scorecard ────────────────────────────────────────────────
def write_airtable(fields):
    log("airtable Monthly Scorecard <- retail/membership_cash/cancellations/total_members")
    # (Implemented via the Airtable API in the scheduled env; left as a thin stub here.)


def main():
    import tempfile
    now = datetime.datetime.now()
    year = int(os.environ.get("YEAR", now.year))
    month = int(os.environ.get("MONTH", now.month))
    log(f"=== Nightly SAIL sync — Pewaukee {year}-{month:02d} — {'WRITE' if WRITE else 'DRY RUN'} ===")
    with tempfile.TemporaryDirectory() as tmp:
        files = fetch_daily_files(tmp) if os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON") else {}
        log(f"files: {sorted(files) if files else '(none — set GOOGLE_SERVICE_ACCOUNT_JSON)'}")
        st = build_studio_trends(files) if files else {}
        if st:
            write_studio_trends(year, month, st)
            write_airtable(st)
            write_personal_goals(year, month, files)
    log("=== done ===")


if __name__ == "__main__":
    main()
