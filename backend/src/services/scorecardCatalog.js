// Monthly Studio Scorecard — metric catalog (single source of truth).
//
// Every metric the scorecard tracks is defined here once. The backend seeds goal
// defaults from this catalog and merges in owner overrides + the month's actuals
// before sending a fully-resolved metric list to the frontend, so the UI never has
// to keep its own copy of the catalog.
//
// Metric keys are STABLE identifiers — a future SAIL/IG/reviews importer maps to
// them. Do not rename a key without a data migration.
//
// type:          number | currency | percent | rating | boolean
// lowerIsBetter: green when at/below goal (attrition, open equipment issues)
// source:        how the field is populated in v1 (all manual entry / paste)

// Color thresholds — editable constants, NOT hard-coded inline in the UI.
const STATUS_THRESHOLDS = { green: 1.0, amber: 0.8 } // ratio of actual / goal

const GROUPS = {
  hero:      { label: 'Hero Metrics',           owner: 'Studio' },
  sales:     { label: 'Sales Engine',           owner: 'Sales & Revenue (Chrissy)' },
  outreach:  { label: 'Outreach & Lead Gen',    owner: 'Marketing & Ops (Marisa)' },
  events:    { label: 'Events & Community',      owner: 'Marketing & Ops (Marisa)' },
  reputation:{ label: 'Reputation & Reach',      owner: 'Marketing & Ops (Marisa)' },
  retention: { label: 'Retention & Experience',  owner: 'Marketing & Ops (Marisa)' },
  facility:  { label: 'Facility & Ops',          owner: 'Marketing & Ops (Marisa)' },
  team:      { label: 'Team & Culture',          owner: 'Manager' },
}

// Display order of the grouped (non-hero) sections.
const GROUP_ORDER = ['sales', 'outreach', 'events', 'reputation', 'retention', 'facility', 'team']

const CATALOG = [
  // ── Hero ───────────────────────────────────────────────────────────────
  { key: 'net_eft_increase',     group: 'hero', label: 'Net EFT Increase',          type: 'currency', goal: 1500, source: 'Studio Trends', auto: 'net_eft_increase',     note: 'EFT increase − decrease' },
  { key: 'net_members',          group: 'hero', label: 'Net Members',              type: 'number',   goal: 35,   source: 'Studio Trends', auto: 'net_members',          note: 'New − cancelled this month' },
  { key: 'in_the_bank',          group: 'hero', label: 'In The Bank',              type: 'currency', goal: 0,    source: 'Studio Trends', auto: 'in_the_bank', autoGoal: 'itb_goal', note: 'vs monthly ITB goal' },
  { key: 'five_star_reviews',    group: 'hero', label: '5-Star Reviews (Δ MoM)',    type: 'number',   goal: 10,   source: 'Studio Trends', auto: 'five_star_reviews_delta', note: 'This month − last month' },
  { key: 'ig_follower_growth',   group: 'hero', label: 'Instagram Growth (Δ MoM)',  type: 'number',   goal: 50,   source: 'Studio Trends', auto: 'ig_growth_delta',      note: 'This month − last month' },

  // ── Sales Engine (Chrissy) ─────────────────────────────────────────────
  { key: 'checkin_show_rate',    group: 'sales', label: 'Check-in Show Rate',       type: 'percent', goal: 80,  source: 'Studio Trends', auto: 'checkin_show_rate', note: 'Appts held ÷ appts booked' },
  { key: 'sweat_elite_mix',      group: 'sales', label: 'Sweat Elite Mix',          type: 'percent', goal: 80,  source: 'Studio Trends', auto: 'sweat_elite_mix', note: '% of new memberships that are Elite' },
  { key: 'attrition_rate',       group: 'sales', label: 'Attrition / Cancel Rate',  type: 'percent', goal: 4,   source: 'Studio Trends', auto: 'attrition_rate', lowerIsBetter: true, note: 'Cancellations ÷ last month members' },
  { key: 'referrals_received',   group: 'sales', label: 'Referrals Received',       type: 'number',  goal: 10,  source: 'SAIL',  note: 'Owner-set target' },
  { key: 'outreach_per_shift',   group: 'sales', label: 'Outreach / Shift (calls+texts)', type: 'number', goal: 50, source: 'Trends + Schedule', auto: 'outreach_per_shift', note: 'Calls+texts ÷ shifts to date' },

  // ── Outreach & Lead Gen (Marisa) ───────────────────────────────────────
  { key: 'guest_passes',         group: 'outreach', label: 'Guest Passes / Outreach Pieces', type: 'number', goal: 2000, source: 'manual', note: 'Team top-of-funnel volume' },
  { key: 'flyers_distributed',   group: 'outreach', label: 'Flyers Distributed',     type: 'number', goal: 500, source: 'manual', note: 'Owner-set target' },
  { key: 'neighborhoods_flyered',group: 'outreach', label: 'Neighborhoods Flyered',  type: 'number', goal: 4,   source: 'manual', note: 'Owner-set target' },
  { key: 'lead_boxes_active',    group: 'outreach', label: 'Lead Boxes Active',      type: 'number', goal: 30,  source: 'b2b',    note: 'Team target' },
  { key: 'businesses_contacted', group: 'outreach', label: 'Businesses Contacted',   type: 'number', goal: 20,  source: 'b2b',    note: 'Owner-set; from B2B outreach' },
  { key: 'apartments_contacted', group: 'outreach', label: 'Apartments Contacted',   type: 'number', goal: 10,  source: 'b2b',    note: 'Owner-set; from B2B outreach' },
  { key: 'corporate_presentations', group: 'outreach', label: 'Corporate Presentations Held', type: 'number', goal: 1, source: 'events', note: '1 per month' },

  // ── Events & Community (Marisa) ────────────────────────────────────────
  { key: 'events_held',          group: 'events', label: 'Events Held',             type: 'number', goal: 2, source: 'Events',  auto: 'events_held',          note: 'All events this month' },
  { key: 'promotions_run',       group: 'events', label: 'Promotions Run',          type: 'number', goal: 5, source: 'Events',  auto: 'promotions_run',       note: '≥1 outside + 4 studio-wide' },
  { key: 'business_of_the_month',group: 'events', label: 'Business of the Month',   type: 'number', goal: 1, source: 'Events',  auto: 'business_of_the_month', note: 'Event type this month' },
  { key: 'influencer_visits',    group: 'events', label: 'Influencer Visits',       type: 'number', goal: 1, source: 'Events',  auto: 'influencer_visits',    note: 'Event type this month' },

  // ── Reputation & Reach (Marisa) ────────────────────────────────────────
  { key: 'reviews_responded_24h',group: 'reputation', label: 'Reviews Responded < 24h', type: 'percent', goal: 100, source: 'manual', note: 'Standard from JD' },
  { key: 'social_posts',         group: 'reputation', label: 'Social Posts',         type: 'number', goal: 20, source: 'manual', note: '≈5 per week' },
  { key: 'video_assets',         group: 'reputation', label: 'Video Assets Created', type: 'number', goal: 8,  source: 'manual', note: '≈2 per week' },
  { key: 'overall_star_rating',  group: 'reputation', label: 'Overall Star Rating',  type: 'rating', goal: 4.8, source: 'reviews', note: 'Owner-set; Google/FB/Yelp snapshot' },

  // ── Retention & Experience (Marisa) ────────────────────────────────────
  { key: 'new_member_week1',     group: 'retention', label: 'New-Member Week-1 Check-ins', type: 'number', goal: 50, autoGoal: 'new_members', source: 'manual', note: 'Count checked in · goal = new members' },
  { key: 'atrisk_winback',       group: 'retention', label: 'At-Risk Win-Back (14-day)',   type: 'percent', goal: 100, source: 'manual', note: '100% of lapsing members' },
  { key: 'newsletter_sent',      group: 'retention', label: 'Monthly Newsletter Sent',     type: 'boolean', goal: 1,   source: 'manual', note: 'Yes / No' },
  { key: 'thankyou_cards',       group: 'retention', label: 'Thank-You Cards w/ $5 Cert',  type: 'number', goal: 50, autoGoal: 'new_members', source: 'manual', note: 'Count of cards · goal = new members' },

  // ── Facility & Ops (Marisa) ────────────────────────────────────────────
  { key: 'cleaning_compliance',  group: 'facility', label: 'Cleaning Checklist Compliance', type: 'percent', goal: 100, source: 'Cleaning', auto: 'cleaning_compliance', note: 'Tasks completed ÷ due (month to date)' },
  { key: 'open_maintenance_issues', group: 'facility', label: 'Open Maintenance Issues', type: 'number', goal: 0, source: 'Maintenance', auto: 'open_maintenance_issues', lowerIsBetter: true, note: 'Open + in-progress items' },
  { key: 'manual_inventory_count', group: 'facility', label: 'Manual Inventory Count Done', type: 'boolean', goal: 1, source: 'manual', note: 'Yes / No — last business day' },

  // ── Team & Culture (Manager) ───────────────────────────────────────────
  { key: 'team_outing',      group: 'team', label: 'Team Outing Held',  type: 'date', source: 'manual', note: 'Date held' },
  { key: 'team_meeting',     group: 'team', label: 'Team Meeting Held', type: 'date', source: 'manual', note: 'Date held' },
  { key: 'monthly_challenge', group: 'team', label: 'Monthly Challenge', type: 'text', source: 'manual', note: 'Describe this month’s challenge' },
]

const HERO_KEYS = CATALOG.filter(m => m.group === 'hero').map(m => m.key)
const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map(m => [m.key, m]))

module.exports = {
  STATUS_THRESHOLDS,
  GROUPS,
  GROUP_ORDER,
  CATALOG,
  HERO_KEYS,
  CATALOG_BY_KEY,
}
