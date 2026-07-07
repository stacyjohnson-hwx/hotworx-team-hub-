// Studio-local date helpers. The studio operates in America/Chicago, so "today"
// and "this month" must be computed in that timezone — NOT via toISOString(),
// which returns UTC and rolls over to the next day every evening after ~7pm CT.

const STUDIO_TZ = 'America/Chicago'

// YYYY-MM-DD for the studio's current calendar day.
function todayInChicago() {
  return new Date().toLocaleDateString('en-CA', { timeZone: STUDIO_TZ })
}

// YYYY-MM for the studio's current month (used for month_key lookups).
function monthKeyInChicago() {
  return todayInChicago().slice(0, 7)
}

module.exports = { todayInChicago, monthKeyInChicago, STUDIO_TZ }
