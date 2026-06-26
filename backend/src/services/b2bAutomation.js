const { createClient } = require('@supabase/supabase-js')

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Reaching out — a logged interaction or a newly linked event — moves a fresh or
// cooled lead to "Contacted". Single source of truth shared by the interactions
// and events routes (mirrors the nightly cool-off that does the reverse).
async function markContacted(contactIds) {
  const ids = (Array.isArray(contactIds) ? contactIds : [contactIds]).filter(Boolean)
  if (!ids.length) return
  await db().from('b2b_contacts')
    .update({ status: 'contacted', updated_at: new Date().toISOString() })
    .in('id', ids)
    .in('status', ['new_lead', 'follow_up'])
}

module.exports = { markContacted }
