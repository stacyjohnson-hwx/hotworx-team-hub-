// Social connectors via Apify (PRD §4, scrape path). One token (APIFY_TOKEN)
// covers every platform — no per-platform developer app / OAuth / app review.
// Each connector runs an Apify actor against the channel's public profile URL
// (social_channels.external_id) and returns the current numbers.

const APIFY_BASE = 'https://api.apify.com/v2/acts'

// Actor ids (store slugs → API form uses ~). Public follower / review counts.
const ACTORS = {
  instagram: 'apify~instagram-profile-scraper',
  facebook: 'apify~facebook-pages-scraper',
  tiktok: 'clockworks~tiktok-scraper',
  google: 'compass~crawler-google-places',
}

// Run an actor synchronously and return its dataset items (array).
async function runActor(actor, input) {
  const token = process.env.APIFY_TOKEN
  const url = `${APIFY_BASE}/${actor}/run-sync-get-dataset-items?token=${token}`
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Apify ${actor} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const items = await res.json()
  return Array.isArray(items) ? items : []
}

const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === 'number' && !Number.isNaN(v)) return v
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  }
  return null
}
const usernameFrom = (s = '') => String(s).replace(/\/+$/, '').split('/').pop().replace(/^@/, '').trim()

const INPUT = {
  instagram: (ch) => ({ usernames: [usernameFrom(ch.external_id || ch.handle)] }),
  facebook: (ch) => ({ startUrls: [{ url: ch.external_id || ch.handle }] }),
  tiktok: (ch) => ({ profiles: [usernameFrom(ch.external_id || ch.handle)], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false }),
  google: (ch) => ({ searchStringsArray: [ch.external_id || ch.handle], maxCrawledPlacesPerSearch: 1, language: 'en' }),
}

// Core: scrape one channel. Returns { data, rawKeys, count, error } — `data` is
// { followers } | { rating, review_count } | null. rawKeys/count surface actual
// field names so we can tune extraction from a live run instead of guessing.
async function scrapeChannel(channel) {
  if (!process.env.APIFY_TOKEN) return { data: null, error: 'no_token' }
  const p = channel.platform
  if (!ACTORS[p] || !INPUT[p]) return { data: null, error: 'unknown_platform' }
  try {
    const items = await runActor(ACTORS[p], INPUT[p](channel))
    const item = items[0] || {}
    const rawKeys = Object.keys(item).slice(0, 50)
    if (p === 'google') {
      const rating = pick(item, ['totalScore', 'rating', 'stars', 'averageRating'])
      const review_count = pick(item, ['reviewsCount', 'reviewCount', 'numberOfReviews', 'reviews'])
      return { data: (rating != null || review_count != null) ? { rating, review_count } : null, rawKeys, count: items.length }
    }
    let followers = pick(item, ['followersCount', 'followers', 'followerCount', 'fans'])
    if (followers == null && item.authorMeta) followers = pick(item.authorMeta, ['fans', 'followers', 'followerCount'])
    return { data: followers != null ? { followers } : null, rawKeys, count: items.length }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

function connectorStatus() {
  const on = !!process.env.APIFY_TOKEN
  return { instagram: on, facebook: on, tiktok: on, google: on }
}

// Thin per-platform wrappers for the nightly job (return current numbers or null).
const FETCHERS = Object.fromEntries(['instagram', 'facebook', 'tiktok', 'google'].map(p =>
  [p, async (ch) => (await scrapeChannel(ch)).data]))

module.exports = { FETCHERS, connectorStatus, scrapeChannel, runActor, ACTORS }
