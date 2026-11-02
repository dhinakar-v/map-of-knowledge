/** Dates for "What changed" on the Start here page, kept in this browser. */

/** YYYY-MM-DD in local time (toISOString would give the UTC day, a day early or late near midnight). */
export function localDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function daysAgo(days: number, from = new Date()) {
  const d = new Date(from)
  d.setDate(d.getDate() - days)
  return localDate(d)
}

const KEY = 'maptree:internal:visits'

/** Record today's visit and return the previous day this browser opened the page ('' on a first visit).
 * Several visits on one day keep the same previous day, so coming back later the same day still shows what
 * changed since the last day you looked. */
export function recordVisit(today = localDate()): string {
  let visits = { prev: '', last: '' }
  try {
    visits = { ...visits, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    visits.last ||= localStorage.getItem('maptree:internal:lastVisit') ?? ''  // the key used before
  } catch {
    /* unreadable or blocked: treat as a first visit */
  }
  if (visits.last && visits.last !== today) visits = { prev: visits.last, last: today }
  else visits = { prev: visits.prev, last: today }
  try {
    localStorage.setItem(KEY, JSON.stringify(visits))
  } catch {
    /* ignore */
  }
  return visits.prev
}
