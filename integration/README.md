# SAIL → HOTWORX integration (data pipeline)

Turns manual SAIL POS exports into clean data and (eventually) pushes a small,
**validated** set of monthly metrics into the app's Supabase `studio_trends` table.
Full design spec: `HOTWORX_Integration_Handoff.md` (kept with the owner).

**Principle:** Airtable is the brain (dedup, DNC suppression, call lists, automations).
The HOTWORX app is a dashboard fed once a night. This folder is the data layer that
sits between SAIL exports and the app.

## The hand-off point: Airtable "Monthly Scorecard"
The Airtable base (`appTQPmbMRZA6sWr5`) has a **Monthly Scorecard** table — one row
per month, already aggregated into app-shaped numbers. **That row is what the
nightly job pushes** — no file parsing in the job itself. Confirmed mapping:

| metric | studio_trends column | rule | Status |
|---|---|---|---|
| Membership Cash | `membership_cash` | MembershipCash + PIF gross | ✅ |
| Retail | `retail` | Sales gross where Type=Retail | ✅ |
| Total Members | `total_member_count` | active member rows | ✅ |
| EFT Decrease | `eft_decrease` | Σ cancellation Monthly Payment | ✅ |
| Cancellations | `cancellations` | count **excluding** Package Name "Membership Downgrade" | ✅ (=18) |
| Sweat Elite % | `sweat_elite_pct` | elite ($79/$39.50) ÷ memberships **this calendar month** → 46.2% | ✅ |
| New Members | `new_members` | candidate: memberships with Subscription Date this month = **13** | ⛔ confirm |

These rules live in code (`compute_studio_trends.py`), so the nightly job applies
them — it does NOT trust raw Airtable/Scorecard values that haven't had the rules
applied (e.g. the Scorecard's Cancellations is still the raw 24).

## Files
- `push_to_supabase.py` — **the nightly pusher.** Reads the Monthly Scorecard row
  via the Airtable API → writes the 3 safe fields to `studio_trends`, Pewaukee-only
  + `locked = false` guard. **DRY RUN by default; `--write` to apply.** Needs
  `AIRTABLE_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env vars.
- `sail_normalizer.py` — normalizer for the raw SAIL files (handles every quirk;
  detects reports by **column signature**, not filename). Used on the Drive→Airtable
  side and for cross-checking.
- `compute_studio_trends.py` — **DRY RUN** validator that re-derives the numbers
  straight from the raw exports, to confirm Airtable's Scorecard is correct. Writes nothing.

## Run the validator
```bash
pip3 install pandas openpyxl
python3 integration/compute_studio_trends.py "/path/to/exports/folder"
```

## Status (validated against the app's known-good numbers, June 2026)
**SAFE to auto-push** (export exactly matches app definition):
- `membership_cash` = MembershipCash + PIF gross — **$1,541.08** ✓
- `total_member_count` = active member rows — **468** ✓
- `eft_decrease` = sum of Cancellations Monthly Payment — **$1,128.00** ✓

**BLOCKED — need an owner definition before auto-push** (would corrupt the dashboard):
- `retail` — gross $2,580.66 vs net $2,457.73. Rule? gross or net-of-refunds?
- `cancellations` — export = 24 rows; owner says 18. The "18" is a SAIL rule not in
  the export (type breakdown sums to 16). Stays **manual** until the rule is given.
- `sweat_elite_pct` — Elite packages = 78/468 = 16.7%, but the app shows ~50. The
  app metric measures something else; define before overwriting.

**DO NOT TOUCH** (human-entered, no SAIL source): calls/texts (until per-staff phase),
red appts, leads, socials, expenses, ITB, goals.

## Not built yet (needs inputs)
1. **Supabase pusher** — writes the 3 safe fields, `locked = false` + Pewaukee-only
   guards. Needs the Supabase service-role key + confirmation the project ref is
   `qiabgzcephexksvhqdir` (NOT the Momentum project `mmmkfumuzhhkcgzsjtbg`).
2. **Per-staff (`personal_goals`)** — Sales-by-employee already computes per person;
   needs a **name→user_id map** (`ChrissyBlawat`/`Bailey.Boche`/… → `user_profiles.id`).
3. **Airtable loaders** + the operational automations (onboarding, win-back,
   utilization follow-up, call lists) — live in Airtable + Make.com, not here.
4. **Month-end lock** — Supabase pg_cron (pure SQL).

Everything that touches the live app is **dry-run-first, Pewaukee-only, lock-guarded.**
