"""
DRY RUN — compute the studio_trends fields from a folder of SAIL exports and print
a validation table. This WRITES NOTHING. It exists to prove each value matches the
app's known-good numbers before we ever auto-push.

Run:
    python3 integration/compute_studio_trends.py "/path/to/folder/of/exports"

It matches files by keyword in the filename (members, sales, cancel, util, campaign),
so exact names don't matter as long as the keyword is present.
"""
import sys
import glob
import os
import datetime
import pandas as pd
from sail_normalizer import normalize, money

# Detect each report by the columns it contains (robust to filename typos and to
# a folder full of other files). Each role needs ALL of its signature columns.
SIGNATURES = {
    "util":     {"Days Since Last Booking"},
    "members":  {"Subscription Id", "Cancellation Date"},
    "sales":    {"Gross Cost", "Employee", "Type"},
    "cancel":   {"Cancellation Type", "Monthly Payment"},
    "campaign": {"Lead Status", "Automation Path"},
}


def _headers(path):
    try:
        from sail_normalizer import _read_raw
        return set(h for h in _read_raw(path).iloc[1].tolist() if isinstance(h, str))
    except Exception:
        return set()


def detect(folder):
    cands = sorted(
        glob.glob(os.path.join(folder, "*.xlsx")) + glob.glob(os.path.join(folder, "*.csv")),
        key=os.path.getmtime, reverse=True,  # newest wins on ties
    )
    roles = {}
    for f in cands:
        cols = _headers(f)
        for role, sig in SIGNATURES.items():
            if role not in roles and sig.issubset(cols):
                roles[role] = f
    return roles


def main(folder):
    global TARGET_YEAR, TARGET_MONTH
    now = datetime.date.today()
    TARGET_YEAR = int(os.environ.get("YEAR", now.year))
    TARGET_MONTH = int(os.environ.get("MONTH", now.month))
    print(f"Target month: {TARGET_YEAR}-{TARGET_MONTH:02d}  (override with YEAR=/MONTH= env)\n")

    detected = detect(folder)
    paths = {role: detected.get(role) for role in SIGNATURES}  # all keys present (None if missing)
    for role in SIGNATURES:
        p = paths.get(role)
        print(f"  {role:10s} -> {os.path.basename(p) if p else '*** NOT FOUND ***'}")
    print()

    safe, blocked = {}, {}

    # ── SAFE: membership_cash = MembershipCash + PIF (gross) ──
    if paths["sales"]:
        s = normalize(paths["sales"])
        g = money(s["Gross Cost"]); n = money(s["Net Cost"])
        is_memcash = s["Type"].isin(["MembershipCash", "PIF"])
        safe["membership_cash"] = round(g[is_memcash].sum(), 2)
        is_retail = s["Type"].astype(str).str.contains("retail", case=False, na=False)
        safe["retail"] = round(g[is_retail].sum(), 2)        # RULE: gross (owner-confirmed)
        # per-employee POS (gross of all sale types) and retail
        s["_g"] = g
        per = s.groupby("Employee")["_g"].sum().round(2)
        per_retail = s[is_retail].groupby("Employee")["_g"].sum().round(2)
        print("Per-employee POS (gross) / retail:")
        for emp in per.index:
            print(f"   {emp:18s} POS ${per[emp]:>9.2f}   retail ${per_retail.get(emp, 0):>9.2f}")
        print()

    # ── SAFE: total_member_count (from CSV) ──
    # new_members and sweat_elite_pct come from the SALES/MEMBER DASHBOARD via
    # read_dashboard.py — that's SAIL's authoritative "New Member Breakdown":
    #   new_members      = 18
    #   sweat_elite_pct  = new_elite (11) / new_members (18) = 61%   ("Sweat Elite Mix")
    # We deliberately do NOT recompute them from the members file (the subscription-date
    # method gave a different 13 / 46.2% and would conflict).
    if paths["members"]:
        m = normalize(paths["members"])
        safe["total_member_count"] = int(m.shape[0])

    # ── SAFE: eft_decrease (all rows) + cancellations count (exclude downgrades) ──
    if paths["cancel"]:
        c = normalize(paths["cancel"])
        safe["eft_decrease"] = round(money(c["Monthly Payment"]).sum(), 2)
        # RULE: cancellations excludes Package Name == 'Membership Downgrade' (owner-confirmed)
        not_downgrade = ~c["Package Name"].astype(str).str.contains("downgrade", case=False, na=False)
        safe["cancellations"] = int(not_downgrade.sum())

    # ── Operational (Airtable side, FYI) ──
    if paths["util"]:
        u = normalize(paths["util"])
        d = pd.to_numeric(u["Days Since Last Booking"], errors="coerce")
        print("Win-back (Utilization, pre-DNC/active filter):",
              f"14+ days={int((d >= 14).sum())}  (60+={int((d >= 60).sum())},"
              f" 30-59={int(((d >= 30) & (d < 60)).sum())}, 14-29={int(((d >= 14) & (d < 30)).sum())})")
    if paths["campaign"]:
        cam = normalize(paths["campaign"])
        dnc = (cam["Lead Status"].astype(str).str.strip() == "Do Not Call").sum()
        sub = cam["Sub Status"].astype(str)
        print(f"DNC suppression list: {int(dnc)}  |  Missed Guest/Be Back: "
              f"{int(sub.str.contains('Missed Guest', na=False).sum())}  |  "
              f"No Show/Red Appt Canceled: {int(sub.isin(['No Show', 'Red Appointment Canceled']).sum())}")

    print("\n" + "=" * 60)
    print("SAFE to auto-push to studio_trends (validate vs app first):")
    for k, v in safe.items():
        print(f"   {k:22s} = {v}")
    print("\nBLOCKED — needs an owner definition before auto-push:")
    for k, v in blocked.items():
        print(f"   {k:22s} = {v}")
    print("=" * 60)
    print("NOTE: this script does not write to Supabase. It is validation only.")


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads")
    main(folder)
