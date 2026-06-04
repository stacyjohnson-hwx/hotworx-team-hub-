# Multi-Studio Architecture Implementation Plan

## Overview
Hybrid multi-tenant architecture where some data is shared across all studios (competitors, B2B partners, cleaning tasks) and some is studio-specific (schedules, goals, leads).

## Completed - Phase 1: Foundation ✅

### Database Schema
- ✅ Created `studios` table with studio details (code, name, address, timezone)
- ✅ Created `user_studios` junction table (many-to-many relationship)
- ✅ Added RLS policies
- ✅ Inserted WI0009 (HOTWORX Pewaukee) and WI0021 (HOTWORX Madison)
- ✅ Assigned Stacy as owner of both studios

### Frontend
- ✅ Created `StudioContext` provider
- ✅ Created `StudioSwitcher` component
- ✅ Added studio switcher to sidebar
- ✅ Integrated StudioProvider into app

## Phase 2: Add studio_id to Operational Tables

### Tables That Need studio_id Column
- [x] `shifts` (schedules)
- [x] `blocked_days`
- [x] `time_off_requests`
- [x] `studio_goals`
- [x] `personal_goals`
- [x] `studio_trends`
- [ ] `leads`
- [ ] `eod_submissions`
- [ ] `events`
- [ ] `promotions`
- [ ] `orders`
- [ ] `user_profiles` (home studio)
- [ ] `coaching_sessions`
- [ ] `todo_items`
- [ ] `maintenance_requests`
- [ ] `escalations`

### Migration Strategy
For each table:
1. Add `studio_id uuid REFERENCES studios` column (nullable initially)
2. Backfill existing data with WI0009 studio ID
3. Make column NOT NULL
4. Add RLS policies that filter by studio_id
5. Update frontend to pass currentStudio.id in API calls
6. Update backend routes to filter by studio_id

### Tables That Stay Shared (No studio_id)
- ✅ `competitors` - Shared competitor intelligence
- ✅ `competitor_visits` - (links to competitor, which is shared)
- ✅ `b2b_partners` - Corporate partnerships work across studios
- ✅ `b2b_discounts` - (links to b2b_partners)
- ✅ `cleaning_tasks` - Same task library for all studios
- ✅ `cleaning_completions` - WAIT - This should be studio-specific!
- ✅ `sops` - SOPs are universal
- ✅ `training_library` - Training materials shared
- ✅ `training_completions` - Per-user, no studio needed

### Correction Needed
`cleaning_completions` should be studio-specific since each studio completes tasks independently!

## Phase 3: Update API Routes

### Routes to Update
For each route that handles studio-specific data:
1. Add middleware to get current studio from request
2. Filter queries by studio_id
3. Validate user has access to that studio

Example:
```javascript
// Middleware to extract and validate studio
const requireStudio = async (req, res, next) => {
  const studioId = req.headers['x-studio-id']
  if (!studioId) return res.status(400).json({ error: 'Studio ID required' })
  
  // Verify user has access to this studio
  const { data } = await db()
    .from('user_studios')
    .select('role')
    .eq('user_id', req.user.id)
    .eq('studio_id', studioId)
    .single()
  
  if (!data) return res.status(403).json({ error: 'No access to this studio' })
  
  req.studio = { id: studioId, role: data.role }
  next()
}
```

## Phase 4: Update Frontend API Calls

Add studio context to API calls:
```javascript
// In useApi hook or similar
const studioId = currentStudio?.id
const headers = {
  ...defaultHeaders,
  'X-Studio-ID': studioId,
}
```

## Timeline
- **Phase 1 (Completed)**: Multi-tenant foundation
- **Phase 2 (Next 2-3 weeks)**: Add studio_id to tables incrementally
  - Start with schedules (most critical)
  - Then goals, leads, EOD
  - Then remaining modules
- **Phase 3 (1 week)**: Update all API routes
- **Phase 4 (1 week)**: Update frontend API integration
- **Launch Studio 2**: When new location opens (few months)

## Notes
- All existing data will be assigned to WI0009 (Pewaukee)
- When WI0021 (Madison) opens, create new users for that team
- Stacy will switch between studios using the dropdown
- Future regional manager can be assigned to multiple studios
