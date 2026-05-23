# HOTWORX Pewaukee Team Hub — CLAUDE.md

## Project Overview

Internal web application for HOTWORX Pewaukee (studio code WI0009, Heat Therapy Inc.).
Replaces paper checklists, group texts, and spreadsheets with a centralized, role-aware
daily operations tool for the studio owner, manager, and TSA staff.

**PRD source:** `HOTWORX_TeamHub_PRD.docx` (same directory as this file)

---

## Working Directory Layout

```
hotworx-team-hub/
├── frontend/          # React 18 + Vite + Tailwind CSS + shadcn/ui
├── backend/           # Node.js + Express REST API
├── CLAUDE.md          # ← you are here
└── README.md
```

---

## Users & Roles

Three roles with distinct permissions. Role is stored in the Supabase Auth JWT custom claim (`app_metadata.role`).

| Role | Who | Notes |
|------|-----|-------|
| `owner` | Stacy Johnson | Full access including private modules |
| `manager` | Bailey Boche | Full operational access; no owner private to-do |
| `tsa` | Chrissy, Synneva, Bryn, Marisa | View-only for most modules; complete tasks + EOD |

**Permission matrix per module:**

| Module | owner | manager | tsa |
|--------|-------|---------|-----|
| Schedule | edit | edit | view own + team |
| Goals (Studio) | edit | edit | view |
| Goals (Personal) | edit | edit | view own |
| Lead Generation | edit | edit | edit (daily actuals) |
| Events & Promos | edit | edit | view |
| B2B Outreach | edit | edit | view assigned |
| Orders | edit | edit | view pending; EOD notes |
| EOD Checkout | view all | view all | submit own |
| Cleaning Checklist | manage library | manage library | complete tasks |
| Manager To-Do | full | full | NO ACCESS |
| Coaching | full | full | NO ACCESS |
| Time Off | view + approve | view + approve | submit + view own |
| SOPs | edit | edit | view |
| Training Library | edit | edit | view |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Backend | Node.js + Express |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (JWT with role in app_metadata) |
| Email | Nodemailer + Resend (EOD digest cron) |
| File Storage | Supabase Storage (SOPs, coaching transcripts) |
| Frontend Host | Vercel |
| Backend Host | Railway |
| Repo | Single monorepo — `frontend/` and `backend/` folders |

### Brand Colors (Tailwind custom tokens)

```js
// tailwind.config.js
colors: {
  brand: {
    red: '#C8102E',
    dark: '#1A1A1A',
  }
}
```

---

## Environment Variables

**Never hardcode these — always read from env.**

### Backend `.env`
```
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# Email (Resend)
RESEND_API_KEY=
OWNER_EMAIL=stacy.johnson@hotworx.net
MANAGER_EMAIL=manager.wi0009@hotworx.net
EOD_SEND_TIME=22:00
EOD_TIMEZONE=America/Chicago

# App config
STUDIO_NAME=HOTWORX Pewaukee
STUDIO_CODE=WI0009
STUDIO_ADDRESS=1279 Capitol Drive, Pewaukee, WI 53072
DRAWER_VARIANCE_THRESHOLD=5.00
LEAD_DAILY_GOAL=5
LEAD_MONTHLY_GOAL=145
CONVERSION_RATE_GOAL=35
CHECKIN_SHOW_RATE_GOAL=80
STUDIO_CLOSE_RATE_GOAL=50
PORT=3001
```

### Frontend `.env`
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:3001
```

---

## Commission Calculation Logic

Used in the Personal Goals module. Must match exactly:

### EFT Commission
- Monthly quota = $500 EFT increase (≈ 10 memberships at avg $50/month)
- ≤ $500 EFT increase → **15%** commission on total collected at POS
- > $500 EFT increase → **30%** commission on total collected at POS

### Membership PIF (Paid In Full)
- 12-month or longer term → **10%** on collected payments
- 6-month or longer term → **5%** on collected payments

### Retail
- $1,000–$1,999 individual retail sales → **10%**
- $2,000–$2,999 individual retail sales → **11%**
- $3,000+ individual retail sales → **15%**

### In The Bank (ITB) Bonus
- Monthly goal met → **$50 flat bonus**
- Monthly goal exceeded by ≥10% → **$100 flat bonus**
- Manager can manually override bonus amount (rare PIF edge cases)

---

## Email Delivery

### EOD Nightly Digest
- **Trigger:** Cron job at 10:00 PM CT (`America/Chicago`) daily
- **Also triggers:** Immediately when a Closing shift EOD is submitted
- **Recipients:** `stacy.johnson@hotworx.net` + `manager.wi0009@hotworx.net`
- **Subject:** `HOTWORX Pewaukee — EOD Report [Date]`
- **Format:** One section per shift submitted; clean HTML table
- **Alert:** Drawer variance > $5 highlighted in red

### In-App Notifications (no email)
- Order request created (Manager notified)
- Time-off request submitted (Manager notified)
- Time-off request approved/denied (TSA notified)
- Cleaning tasks incomplete at 9 PM (optional Manager alert)

---

## Data Architecture Notes

### Month-Based Historical Navigation
All time-sensitive records include a `month` (1–12) and `year` column.
The global month/year selector in the nav bar filters all modules.
- Current month = default view
- Past months = read-only for TSA; editable for Owner + Manager

### Recurring Records
- B2B partner discounts marked `ongoing=true` auto-carry to each new month
- Promotional offers marked `ongoing=true` auto-carry monthly
- Cleaning task recurrence is rule-based (not row-copied per month)

### Cleaning Task Frequencies
| Frequency | Logic |
|-----------|-------|
| Daily | Appears every day; resets at midnight |
| Weekly | Appears on configured day of week |
| Monthly | Appears on configured day of month |
| Quarterly | Appears on 4 manager-set dates per year |
| One-Off | Appears on one specific date; disappears after completion |

---

## Build Milestones

Work one milestone at a time. Test in browser before moving to the next.

| # | Milestone | Modules | Status |
|---|-----------|---------|--------|
| M1 | Auth + Role Framework + Nav Shell | Login, JWT, role routing, nav skeleton with month selector | ✅ |
| M2 | Cleaning Checklist | Daily-reset logic, task library, TSA completion view | ✅ |
| M3 | EOD Shift Checkout + Email | Form, cron job, HTML digest email | ✅ |
| M4 | Schedule + Time Off | Weekly view, shift CRUD, time-off queue | ✅ |
| M5 | Goals + Lead Generation | Studio/personal goals, commission calc, sparkline | ⬜ |
| M6 | Events + Promotions + B2B Discounts | CRUD + ongoing auto-carry | ✅ |
| M7 | B2B Outreach Tracker + Orders | Pipeline view, order approval flow | ✅ |
| M8 | SOPs + Training Library | File upload, versioning, completion tracking | ✅ |
| M9 | Coaching Section + Manager To-Do | Private modules, push-to-todo | ✅ |
| M10 | Historical Navigation | Wire month switching across all modules | ⬜ |
| M11 | User Management + Profiles + Onboarding | In-app team CRUD, motivation quiz, profile photos | ✅ |

Update the Status column (⬜ = pending, 🔄 = in progress, ✅ = complete) as each milestone ships.

---

## Local Development

```bash
# Frontend
cd frontend
npm install
npm run dev        # http://localhost:5173

# Backend
cd backend
npm install
npm run dev        # http://localhost:3001
```

---

## Frontend Structure

```
frontend/src/
├── components/       # Shared UI: Button, Modal, Badge, MonthNav, RoleGuard
├── pages/
│   ├── auth/         # Login page
│   ├── schedule/
│   ├── goals/
│   ├── leads/
│   ├── events/
│   ├── b2b/
│   ├── orders/
│   ├── eod/
│   ├── cleaning/
│   ├── todo/         # Owner + Manager only
│   ├── coaching/     # Owner + Manager only
│   ├── timeoff/
│   ├── sops/
│   └── training/
├── contexts/
│   ├── AuthContext.jsx    # Supabase session + role
│   └── MonthContext.jsx   # Global month/year selector state
├── hooks/
│   ├── useRole.js         # Returns current role; helper: canEdit(), isOwner()
│   ├── useMonth.js        # Current selected month/year
│   └── useApi.js          # Axios wrapper with auth header
└── lib/
    ├── supabase.js        # Supabase client
    └── utils.js           # formatCurrency, formatDate, etc.
```

## Backend Structure

```
backend/src/
├── routes/           # One file per module (auth, schedule, goals, leads, ...)
├── middleware/
│   ├── authMiddleware.js   # Verify Supabase JWT
│   └── roleGuard.js        # requireRole('owner', 'manager') etc.
├── services/
│   ├── commissionCalc.js   # Commission formula (testable, pure function)
│   └── eodEmail.js         # HTML email builder
├── jobs/
│   └── eodEmailCron.js     # node-cron at 22:00 America/Chicago
└── db/
    ├── db.js               # pg Pool from DATABASE_URL
    └── migrations/         # Numbered SQL migration files
```

---

## Key External Links Referenced in EOD Checkout

- Sales training videos spreadsheet: stored as env var `SALES_VIDEO_URL`
- Sales GPT: stored as env var `SALES_GPT_URL`
  (Both linked in the EOD checkout Sales Training section — do not hardcode URLs)

---

## Supabase Setup Notes

1. Create project at supabase.com (free tier)
2. In Auth → Configuration: disable email confirmation for internal app
3. Create users manually in Supabase dashboard (no self-signup)
4. Set role in `app_metadata` for each user: `{ "role": "owner" | "manager" | "tsa" }`
5. Enable Row Level Security (RLS) on all tables
6. RLS policies should check `auth.jwt() -> 'app_metadata' ->> 'role'`

---

*HOTWORX Pewaukee — Heat Therapy Inc. | Internal Use Only*
*PRD Version 1.0 | May 2026*
