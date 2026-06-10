# HOTWORX Team Hub - Pre-Launch Bug Report
**Date:** June 9, 2026  
**Deployment:** Vercel (Frontend) + Railway (Backend)  
**Launch:** Tomorrow

---

## ✅ FIXED - Ready for Launch

### BUG #1: Inventory Count "Load Month" Invalid Field ✅ FIXED
**Status:** Fixed in commit `5b05e13`  
**Issue:** Sent `count_type: 'monthly'` field that doesn't exist in backend  
**Fix:** Removed invalid field + added error feedback  
**Deploy:** Wait 60 seconds for Vercel, then test

### BUG #2: Calendar Shifts Not Sorted by Time ✅ FIXED
**Status:** Fixed in commit `fc08cd9`  
**Issue:** Shifts appeared in creation order, not chronological  
**Fix:** Added `.sort((a, b) => a.start_time.localeCompare(b.start_time))`  
**Deploy:** Live on Vercel

### BUG #3: Delete Button Parameter Order ✅ FIXED
**Status:** Fixed in commit `e229e1f`  
**Issue:** Passed studio ID as request body instead of 3rd parameter  
**Fix:** Changed `apiDelete(path, studioId)` to `apiDelete(path, null, studioId)`  
**Deploy:** Live on Vercel

### BUG #4: Inventory "Load Month" Always Errored (nested order) ✅ FIXED
**Status:** Fixed in commit `7e30eef`  
**Issue:** Backend tried to `.order('sku.product_name')` on a nested/joined relation, which Supabase can't do — query 500'd every time, so the count never loaded  
**Fix:** Removed the nested order; sort entries alphabetically in JavaScript after fetching  
**Deploy:** Live on Railway

### BUG #5: Inventory Count Page Ignored Which Count You Clicked ✅ FIXED
**Status:** Fixed in commit `e2a4b0d`  
**Issue:** "Resume Count" on May still loaded the current month; page loaded by the month dropdown instead of the session ID in the URL  
**Fix:** Removed the count-period picker; page now loads the exact session from the URL  
**Deploy:** Live on Vercel

### BUG #6: Inventory List Showed "0 Counted" Until Submit ✅ FIXED
**Status:** Fixed in commit `6478af0`  
**Issue:** Session `items_counted` was only recalculated on submit, so the Inventory list card always showed 0 progress while counting  
**Fix:** Recalculate and update `items_counted` on every save  
**Deploy:** Live on Railway

### BUG #7: Studio Trends "Failed to Fetch" ✅ FIXED
**Status:** Fixed in commit `4f78a39`  
**Issue:** Single-month query called `.eq()` before `.select()` — invalid in Supabase, so the request threw before running and surfaced as "failed to fetch"  
**Fix:** Reordered so `.select('*')` precedes the `.eq()` filters (matching the working list query)  
**Deploy:** Live on Railway  
**Note:** Pre-existing bug, unrelated to launch-prep changes

### BUG #8: Competitor Visits "Failed to Fetch" ✅ FIXED
**Status:** Fixed in commit `65542b4`  
**Issue:** Same `.eq()` before `.select()` bug as Studio Trends, in the competitor visits query  
**Fix:** Reordered `.select('*')` before filters  
**Deploy:** Live on Railway

### BUG #9: Escalations List "Failed to Fetch" ✅ FIXED
**Status:** Fixed in commit `65542b4`  
**Issue:** Same `.eq()` before `.select()` bug in the escalations list query  
**Fix:** Reordered `.select('*')` before filters  
**Deploy:** Live on Railway

### BUG #10: Inventory Shrinkage Rate Always 0 ✅ FIXED
**Status:** Fixed in commit `65542b4`  
**Issue:** On count submit, the inventory-value loop queried prices inside a `reduce()` without `await`, so every price read as undefined → shrinkage rate was always 0 on submitted counts  
**Fix:** Pre-fetch all retail prices in one query, then compute totals  
**Deploy:** Live on Railway

### BUG #11: Outreach Status Toggle Silently Failed ✅ FIXED
**Status:** Fixed in commit `65542b4`  
**Issue:** The Outreach tab's PATCH used a hand-rolled fetch whose auth header interpolated a Promise (`Bearer [object Promise]`), so marking a contact called/done never saved (401)  
**Fix:** Routed through the existing `apiPatch` helper (correct auth + studio headers); removed dead `handleAction`  
**Deploy:** Live on Vercel

### BUG #12: Dead /api/retail/import/sales Route ✅ FIXED
**Status:** Fixed in commit `65542b4`  
**Issue:** Route called a non-existent `importSales()` export and would crash if hit (frontend doesn't use it, so latent)  
**Fix:** Removed the dead route; sales import goes through `/api/retail/analytics/import-sales`  
**Deploy:** Live on Railway

---

## 🎨 ENHANCEMENTS ADDED (June 9)

- **Inventory count table:** search by product/SKU, dedicated Category column, category filter, and sortable Product Name / Category / Expected columns (commit `9ef8477`)
- **Schedule:** shifts sort chronologically; week now runs **Sunday → Saturday** (commits `fc08cd9`, `e7df63f`)
- **B2B Outreach:** prominent "Log Outreach" button on pipeline cards; "Add Contact" renamed to "Add Outreach" (commit `7a45138`)
- **Inventory count sessions:** delete button to remove unwanted/duplicate counts (commits `a3a6c6c`, `10846a1`, `e229e1f`)

---

## 🔍 NEEDS VERIFICATION BEFORE LAUNCH

### TEST #1: Inventory Count Load Month
**Priority:** CRITICAL  
**Steps:**
1. Hard refresh browser (Cmd+Shift+R)
2. Go to Retail → Inventory tab
3. Click "Resume Count" on May 2026 session
4. Verify 329 items load in spreadsheet
5. Change month dropdown → should auto-reload
6. Try filling in actual counts and saving

**Expected:** 329 inventory items appear sorted alphabetically  
**If fails:** Check browser console and screenshot error

### TEST #2: Delete Count Sessions
**Priority:** HIGH  
**Steps:**
1. Go to Retail → Inventory tab
2. If there are extra June sessions, click trash icon
3. Confirm deletion prompt
4. Session should disappear from list

**Expected:** Delete works without error  
**If fails:** Check console for error

### TEST #3: Schedule Time Sorting
**Priority:** MEDIUM  
**Steps:**
1. Go to Schedule module
2. Add 3 shifts on same day: 6:00 AM, 2:00 PM, 10:00 AM
3. View in both Week and Month views
4. Verify they appear as: 6:00 AM, 10:00 AM, 2:00 PM (chronological)

**Expected:** Shifts sort by time, not by who created them first  
**If fails:** Times are still out of order

---

## 🟡 OPTIONAL IMPROVEMENTS (Post-Launch)

### IMPROVEMENT #1: Per-Month Inventory Snapshots
**Priority:** MEDIUM (deferred from launch by decision)  
**Issue:** Inventory is stored as a single current quantity per product, not a per-month history. So the "Expected" column in any count always reflects the *latest* import — switching count periods doesn't show a different dataset. For launch, the month/year picker was removed and each count loads by its own ID.  
**Fix (if wanted later):** Tie each inventory import to its month and store per-month expected quantities, so each month's count is an independent, editable snapshot you can compare over time.  
**Impact:** Currently fine for standard monthly counting. Only needed if Stacy wants to review/edit historical months independently.

### IMPROVEMENT #2: New Count Session Confirmation
**Priority:** LOW  
**Issue:** Auto-creates new session without asking user  
**Fix:** Add prompt: "No count for May 2026 exists. Create new one?"  
**Impact:** Minor UX - prevents accidental session creation

### IMPROVEMENT #3: Shift Time Validation
**Priority:** LOW  
**Issue:** No validation to prevent end time before start time  
**Fix:** Add frontend check: `if (endTime <= startTime) alert("End time must be after start")`  
**Impact:** Data quality - prevents illogical shifts

---

## 📋 PRE-LAUNCH CHECKLIST

### Deployment Verification
- [ ] **Vercel:** Verify latest deploy succeeded (commit `5b05e13`)
- [ ] **Railway:** Check dashboard - backend responding (not 502)
- [ ] **Environment:** `VITE_API_URL` points to Railway (not localhost)

### User Account Setup
- [ ] **Owner:** Stacy Johnson account exists with `role: "owner"` in `app_metadata`
- [ ] **Manager:** Bailey Boche account exists with `role: "manager"`
- [ ] **TSAs:** Chrissy, Synneva, Bryn, Marisa accounts exist with `role: "tsa"`
- [ ] **Studios:** Both Pewaukee (WI0009) and Madison (WI0021) exist in `studios` table
- [ ] **Mappings:** All users mapped to correct studios in `user_studios` table

### Feature Testing (5 min smoke test)
- [ ] **Login:** All 3 roles can log in
- [ ] **Navigation:** Menu shows correct modules per role (TSA can't see Manager To-Do/Coaching)
- [ ] **Studio Switcher:** Owner/Manager can switch between studios, data reloads
- [ ] **Month Selector:** Switching months updates displayed data
- [ ] **Schedule:** Can add shift, appears on calendar in correct time order
- [ ] **Inventory Count:** Load Month works, displays 329 items (TEST #1 above)
- [ ] **Delete:** Trash icons work on count sessions (TEST #2 above)

### Email Configuration
- [ ] **Resend API:** `RESEND_API_KEY` set in Railway
- [ ] **Recipients:** `OWNER_EMAIL` and `MANAGER_EMAIL` correct
- [ ] **Send Test:** Manually trigger EOD digest, verify emails arrive
- [ ] **Timing:** Cron job set for 10 PM CT (`America/Chicago`)

---

## 🚨 ROLLBACK PLAN

If critical bugs appear after launch:

1. **Immediate:** Notify team not to use the broken module
2. **Quick Fix (<30 min):** Push fix to GitHub, verify Vercel/Railway auto-deploy
3. **Cannot Fix Quickly:** Revert to previous commit:
   ```bash
   git revert HEAD
   git push
   ```
4. **Nuclear Option:** Take app offline, show maintenance page

---

## 📊 KNOWN LIMITATIONS

**Not Bugs - Documented Behavior:**

1. **Historical Month Editing:**
   - TSA users: Read-only for past months ✅
   - Owner/Manager: Can edit past months ✅

2. **Multi-Studio Data Isolation:**
   - Switching studios reloads all data ✅
   - No cross-studio data visible ✅

3. **Email Domain:**
   - Cannot use `@hotworx.net` as Resend sender (Stacy doesn't own domain)
   - Use domain Stacy controls for "From" address
   - Recipients can still be `@hotworx.net`

4. **Inventory Count Sessions:**
   - One `in_progress` session per month per studio
   - Creating new month auto-creates session with current inventory levels
   - Submitted sessions cannot be deleted (only in_progress can)

---

## 🎯 LAUNCH READINESS SCORE

**Current Status:** 95% Ready ✅

**Blockers Resolved:**
- ✅ Inventory Load Month fixed
- ✅ Delete button fixed
- ✅ Calendar sorting fixed

**Pending Tests:** 3 quick verification tests (15 minutes)

**Recommendation:** 
**GO FOR LAUNCH** after completing the 3 verification tests above and the pre-launch checklist.

---

## 📞 SUPPORT CONTACTS

**If issues arise after launch:**
- Technical: Claude Code Agent (this session)
- Deployment: Vercel Dashboard + Railway Dashboard
- Database: Supabase Dashboard
- Email: Resend Dashboard

**Quick Debug Commands:**
```bash
# Check latest frontend deploy
https://vercel.com/dashboard

# Check backend health
curl https://hotworx-team-hub-production.up.railway.app/api/health

# View backend logs
https://railway.app → hotworx-team-hub-production → Logs
```

---

**Good luck with the launch tomorrow! 🚀**
