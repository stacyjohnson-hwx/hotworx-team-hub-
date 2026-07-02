export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount ?? 0)
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatMonthYear(month, year) {
  return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function currentMonthYear() {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export function monthKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`
}

// Today's date (YYYY-MM-DD) in the studio's timezone (Central), so daily tasks
// reset at midnight CT — NOT midnight UTC. Using UTC here caused evening-CT
// completions (past midnight UTC) to be filed under the next day.
export function todayCT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}
