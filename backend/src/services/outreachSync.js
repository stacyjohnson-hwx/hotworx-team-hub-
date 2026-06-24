// On-demand Outreach call-list sync: Airtable (SAIL shadow CRM) → app outreach_contacts.
// Mirrors the nightly routine, but runs server-side so a button in the app can trigger it.
// Requires env: AIRTABLE_TOKEN (personal access token, read scope on the base), AIRTABLE_BASE_ID.
const { createClient } = require('@supabase/supabase-js')

const AT_BASE  = process.env.AIRTABLE_BASE_ID
const AT_TOKEN = process.env.AIRTABLE_TOKEN
const CAP = 300

const TABLES = {
  utilization:   'tblAAKQHeXDrYEaPD',
  members:       'tblr1Pg97gilqbYRR',
  cancellations: 'tbl8zi3G3yKdjVEow',
  contacts:      'tblCAc57QmK2FKPDf',
}
const TILES = {
  notIn2Weeks:      '1d8c9c8d-0d89-43c8-9a74-1eedbae5e52d',
  newMember:        '05cfd4a6-f624-4ff2-8678-815dc20da5c0',
  cancelledMembers: '752435d8-8bfc-4ba5-b5d6-34fcf07b8a5e',
  missedGuests:     '38d796b4-6ed3-4b4c-9e57-50856bce3958',
  noShows:          'ff7e56c6-59a2-4086-aa2b-4fcb7e1d3be8',
}

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function fmtPhone(v) {
  if (v == null) return null
  const digits = String(v).replace(/\D/g, '')
  const ten = digits.length > 10 ? digits.slice(-10) : digits
  if (ten.length !== 10) return v ? String(v) : null
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

async function atFetch(table, { filterByFormula, fields } = {}) {
  let records = [], offset
  do {
    const url = new URL(`https://api.airtable.com/v0/${AT_BASE}/${table}`)
    url.searchParams.set('pageSize', '100')
    if (filterByFormula) url.searchParams.set('filterByFormula', filterByFormula)
    if (fields) fields.forEach(f => url.searchParams.append('fields[]', f))
    if (offset) url.searchParams.set('offset', offset)
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AT_TOKEN}` } })
    if (!r.ok) throw new Error(`Airtable ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    records = records.concat(j.records || [])
    offset = j.offset
  } while (offset && records.length < 4000)
  return records
}

async function replaceTile(sb, tileId, rows) {
  await sb.from('outreach_contacts').delete().eq('tile_id', tileId)
  const capped = rows.slice(0, CAP)
  if (capped.length) {
    const insert = capped.map(r => ({ tile_id: tileId, name: r.name, phone: r.phone || null, notes: r.notes || null, status: 'pending' }))
    const { error } = await sb.from('outreach_contacts').insert(insert)
    if (error) throw error
  }
  return { inserted: capped.length, overflow: Math.max(0, rows.length - CAP) }
}

const f = (r, name) => {
  const v = r.fields[name]
  return v && typeof v === 'object' && 'name' in v ? v.name : v   // unwrap singleSelect objects
}

async function syncOutreach() {
  if (!AT_BASE || !AT_TOKEN) { const e = new Error('Airtable is not configured'); e.code = 'NO_AIRTABLE'; throw e }
  const sb = db()
  const out = {}

  // (a) Members Not In for 2+ Weeks ← Utilization
  {
    const recs = await atFetch(TABLES.utilization, {
      filterByFormula: `AND({Member Status}='Active', NOT({Is DNC}), {Days Since Last Booking}>=14)`,
      fields: ['Full Name', 'Phone', 'Days Since Last Booking'],
    })
    const rows = recs.map(r => ({ name: f(r, 'Full Name'), phone: fmtPhone(f(r, 'Phone')), notes: `${f(r, 'Days Since Last Booking')} days since last booking`, _d: f(r, 'Days Since Last Booking') || 0 }))
      .filter(r => r.name).sort((a, b) => b._d - a._d)
    out['Members Not In 2+ Weeks'] = await replaceTile(sb, TILES.notIn2Weeks, rows)
  }

  // (b) New Member Outreach ← Members
  {
    const recs = await atFetch(TABLES.members, {
      filterByFormula: `AND({Member Onboarded}='No', {Status}='Active')`,
      fields: ['Customer Name', 'Phone Number', 'Subscription Date'],
    })
    const rows = recs.map(r => ({ name: f(r, 'Customer Name'), phone: fmtPhone(f(r, 'Phone Number')), notes: f(r, 'Subscription Date') ? `New member — joined ${f(r, 'Subscription Date')}` : 'New member' }))
      .filter(r => r.name)
    out['New Member Outreach'] = await replaceTile(sb, TILES.newMember, rows)
  }

  // (c) Cancelled Members ← Cancellations (this month), phone joined from Members by Customer Id
  {
    const members = await atFetch(TABLES.members, { fields: ['Customer Id', 'Phone Number'] })
    const phoneById = {}
    for (const m of members) { const id = f(m, 'Customer Id'); if (id != null) phoneById[id] = f(m, 'Phone Number') }
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const recs = await atFetch(TABLES.cancellations, { fields: ['Customer Name', 'Customer Id', 'Cancellation Request Date', 'Reason Category'] })
    const rows = recs
      .filter(r => String(f(r, 'Cancellation Request Date') || '').startsWith(ym))
      .map(r => ({ name: f(r, 'Customer Name'), phone: fmtPhone(phoneById[f(r, 'Customer Id')]), notes: `Cancelled ${f(r, 'Cancellation Request Date') || ''}${f(r, 'Reason Category') ? ' — ' + f(r, 'Reason Category') : ''}` }))
      .filter(r => r.name)
    out['Cancelled Members'] = await replaceTile(sb, TILES.cancelledMembers, rows)
  }

  // (d) Missed Guests ← Contacts
  {
    const recs = await atFetch(TABLES.contacts, {
      filterByFormula: `AND(OR({Lead Status}='Missed Guest', {Sub Status}='Missed Guest / Be Back'), {Lead Status}!='Do Not Contact', {Lead Status}!='Do Not Call', {Do Not Contact}=BLANK())`,
      fields: ['Name', 'Phone'],
    })
    const rows = recs.map(r => ({ name: f(r, 'Name'), phone: fmtPhone(f(r, 'Phone')), notes: 'Missed guest' })).filter(r => r.name)
    out['Missed Guests'] = await replaceTile(sb, TILES.missedGuests, rows)
  }

  // (e) Cancelled Appointments / No Shows ← Contacts
  {
    const recs = await atFetch(TABLES.contacts, {
      filterByFormula: `AND(OR({Sub Status}='No Show', {Sub Status}='Red Appointment Canceled'), {Lead Status}!='Do Not Contact', {Lead Status}!='Do Not Call', {Do Not Contact}=BLANK())`,
      fields: ['Name', 'Phone', 'Sub Status'],
    })
    const rows = recs.map(r => ({ name: f(r, 'Name'), phone: fmtPhone(f(r, 'Phone')), notes: f(r, 'Sub Status') || 'No show' })).filter(r => r.name)
    out['Cancelled Appts / No Shows'] = await replaceTile(sb, TILES.noShows, rows)
  }

  return out
}

module.exports = { syncOutreach, isConfigured: () => Boolean(AT_BASE && AT_TOKEN) }
