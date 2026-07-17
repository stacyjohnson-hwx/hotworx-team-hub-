// Social platform connectors (PRD §4). Each returns the CURRENT count from the
// platform API, or `null` when its credential isn't provisioned yet — so the
// nightly job no-ops gracefully instead of crashing (PRD §4, §6, acceptance §9).
//
// These are intentionally stubs until the tokens exist. When a credential is
// added to the backend env, implement the matching fetch here and the nightly
// snapshot job starts recording real history automatically — no other change.
//
//   META_GRAPH_TOKEN   → Instagram + Facebook (one long-lived Page token)
//   TIKTOK_ACCESS_TOKEN→ TikTok Display API
//   GOOGLE_GBP_TOKEN   → Google Business Profile (rating + review_count)
//
// Contract: return { followers } | { rating, review_count } | null.

async function fetchInstagram(channel) {
  if (!process.env.META_GRAPH_TOKEN) return null
  // TODO: GET https://graph.facebook.com/v19.0/{ig-user-id}?fields=followers_count
  return null
}

async function fetchFacebook(channel) {
  if (!process.env.META_GRAPH_TOKEN) return null
  // TODO: GET https://graph.facebook.com/v19.0/{page-id}?fields=followers_count
  return null
}

async function fetchTikTok(channel) {
  if (!process.env.TIKTOK_ACCESS_TOKEN) return null
  // TODO: TikTok Display API user/info → follower_count
  return null
}

async function fetchGoogle(channel) {
  if (!process.env.GOOGLE_GBP_TOKEN) return null
  // TODO: GBP accounts.locations → averageRating + totalReviewCount
  return null // shape: { rating, review_count }
}

// Returns { configured: boolean } per platform so the dashboard / setup screen
// can tell the owner which connectors still need tokens.
function connectorStatus() {
  return {
    instagram: !!process.env.META_GRAPH_TOKEN,
    facebook: !!process.env.META_GRAPH_TOKEN,
    tiktok: !!process.env.TIKTOK_ACCESS_TOKEN,
    google: !!process.env.GOOGLE_GBP_TOKEN,
  }
}

const FETCHERS = {
  instagram: fetchInstagram,
  facebook: fetchFacebook,
  tiktok: fetchTikTok,
  google: fetchGoogle,
}

module.exports = { FETCHERS, connectorStatus }
