import type { SearchHit } from './types'

/** One pre-built search row per note (public/data/<view>/<account>/search.json). `words` are the already
 *  lowercased, stopword-filtered index words; `body` is the masked plain text for the snippet. */
export interface IndexRow {
  id: string
  title: string
  type: string
  sub: string
  body: string
  words: string[]
}

// Stopwords: kept in step with backend/db.py STOP_WORDS and export_static.py.
const STOP_WORDS = new Set(
  ('a about after all also am an and any are as at be been before being but by can could did do does doing ' +
    'for from get had has have how i if in into is it its just me more most my no not now of on or our out over ' +
    'please should so some tell than that the their them then there these they this those to up us was we were ' +
    'what when where which while who whom whose why will with would you your').split(' '),
)

/** Free text -> query words: lowercased, length>1, stopwords dropped (unless nothing else is left), max 12.
 *  Mirrors db.fts_query so the client ranks the same words the server would have. */
export function queryWords(text: string): string[] {
  const raw = (text.toLowerCase().match(/\w+/g) ?? []).filter((w) => w.length > 1)
  const kept = raw.filter((w) => !STOP_WORDS.has(w))
  return [...new Set(kept.length ? kept : raw)].slice(0, 12)
}

// Field weights approximate db.py's bm25(notes_fts, 0,0,0, 10, 3, 2, 1): title 10, sub 3, props(=title+sub
// here) , body 1. We only have title/sub/body on the client, so: title 10, sub 3, body 1.
const W_TITLE = 10
const W_SUB = 3
const W_BODY = 1

/** A word matches a row's index word as a prefix (FTS5 '"word"*'). */
const prefixHit = (words: string[], q: string) => words.some((w) => w.startsWith(q))

function score(row: IndexRow, qs: string[]): number {
  const title = row.title.toLowerCase()
  const sub = (row.sub ?? '').toLowerCase()
  let s = 0
  for (const q of qs) {
    if (title.includes(q)) s += W_TITLE
    if (sub.includes(q)) s += W_SUB
    if (prefixHit(row.words, q)) s += W_BODY
    if (title.startsWith(q)) s += W_TITLE // favour title-prefix matches, as a leading term would in FTS
  }
  return s
}

const SNIPPET_WORDS = 14
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A short body excerpt around the first query match, with the matched word wrapped in <mark> (like the
 *  server's snippet()). HTML-escaped first; only <mark> is added. */
function snippet(body: string, qs: string[]): string {
  if (!body) return ''
  const tokens = body.split(/\s+/)
  const lower = tokens.map((t) => t.toLowerCase())
  let at = -1
  for (let i = 0; i < lower.length && at < 0; i++) {
    if (qs.some((q) => lower[i].replace(/\W/g, '').startsWith(q))) at = i
  }
  if (at < 0) return ''
  const start = Math.max(0, at - Math.floor(SNIPPET_WORDS / 2))
  const end = Math.min(tokens.length, start + SNIPPET_WORDS)
  const piece = tokens.slice(start, end).map((t) => {
    const bare = t.toLowerCase().replace(/\W/g, '')
    const hit = qs.some((q) => bare.startsWith(q))
    return hit ? `<mark>${escapeHtml(t)}</mark>` : escapeHtml(t)
  })
  return (start > 0 ? '…' : '') + piece.join(' ') + (end < tokens.length ? '…' : '')
}

/** Rank the rows for a query and return up to `limit` hits, newest API shape (id/title/type/sub/snippet).
 *  Scoped by construction: the caller passes only the rows of one view+account. */
export function searchIndex(rows: IndexRow[], text: string, limit = 10): SearchHit[] {
  const qs = queryWords(text)
  if (!qs.length) return []
  const scored = rows
    .map((row) => ({ row, s: score(row, qs) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.row.title.localeCompare(b.row.title))
    .slice(0, limit)
  return scored.map(({ row }) => ({
    id: row.id, title: row.title, type: row.type, sub: row.sub, snippet: snippet(row.body, qs),
  }))
}
