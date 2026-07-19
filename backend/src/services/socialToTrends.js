const { todayInChicago } = require('../utils/dates')

// Push freshly-scraped social numbers onto the CURRENT month's studio_trends row
// so the Studio Trends module reflects the latest counts. Respects locked=false
// (never overwrites a closed month) and only sets fields we actually have.
// values keys: instagram_followers, facebook_followers, tiktok_followers, five_star_reviews.
async function pushSocialToTrends(supabase, studioId, values) {
  const fields = {}
  for (const k of ['instagram_followers', 'facebook_followers', 'tiktok_followers', 'five_star_reviews']) {
    if (values[k] != null) fields[k] = values[k]
  }
  if (!Object.keys(fields).length) return { updated: 0 }

  const [y, m] = todayInChicago().split('-')
  const year = Number(y), month = Number(m)

  // Update the unlocked current-month row.
  const { data: updated } = await supabase.from('studio_trends')
    .update(fields)
    .eq('studio_id', studioId).eq('month', month).eq('year', year).eq('locked', false)
    .select('id')
  if (updated && updated.length) return { updated: updated.length }

  // No unlocked row updated. Create one only if the month has no row at all
  // (if a row exists but is locked, leave it be).
  const { data: existing } = await supabase.from('studio_trends')
    .select('id').eq('studio_id', studioId).eq('month', month).eq('year', year).limit(1)
  if (!existing || !existing.length) {
    const { error } = await supabase.from('studio_trends').insert({ studio_id: studioId, month, year, ...fields })
    return error ? { error: error.message } : { created: 1 }
  }
  return { updated: 0, locked: true }
}

module.exports = { pushSocialToTrends }
