import type { Assignment, MapNode, Tree } from './types'

export const label = (s: string) => s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()).replace(/\bj2w\b/i, 'J2W')
export const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

const PLURALS: Record<string, string> = {
  person: 'J2W people', stakeholder: 'Client people', account: 'Account', department: 'Departments',
  project: 'Projects', team: 'Teams', outcome: 'Outcomes', lesson: 'Lessons', proposal: 'Proposals',
  document: 'Documents',
}
export const plural = (t: string) => PLURALS[t] ?? label(t)

const SINGULAR: Record<string, string> = { person: 'J2W person', stakeholder: 'Client person' }
export const typeLabel = (t: string) => SINGULAR[t] ?? label(t)

export const PEOPLE = ['person', 'stakeholder']
export const isPerson = (n: MapNode) => PEOPLE.includes(n.type)
/** J2W people are `person` notes; client people are `stakeholder` notes. */
export const isOurs = (n: MapNode) => n.type === 'person'

export const PAST_PROJECT = ['completed', 'cancelled']
export const isPastProject = (n: MapNode) => PAST_PROJECT.includes(n.status)

/** Type colours are CSS tokens (light and dark variants). */
export const typeColour = (type: string) => `var(--type-${type}, var(--fg-muted))`
export const prop = (n: MapNode, key: string) => n.props.find((p) => p[0] === key)?.[1] ?? ''

// ---------- dates ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 'YYYY-MM' -> 'Apr 2026'; anything else (empty, TODO) -> '' */
export const fmtMonth = (s: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec((s ?? '').trim())
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
}
export const monthName = (s: string) => MONTHS[Number(s.slice(5, 7)) - 1] ?? ''
/** 'YYYY-MM-DD' (optionally with a time) -> '29 Oct 2026' */
export const fmtDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((s ?? '').trim())
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : s
}
/** "Apr 2026 – Jun 2026", "Since Apr 2026", "Until Jun 2026" or '' when nothing is known. */
export const dateRange = (start: string, end: string, ongoing: boolean) => {
  const s = fmtMonth(start)
  const e = fmtMonth(end)
  if (s && e) return `${s} – ${e}`
  if (s) return ongoing ? `Since ${s}` : `From ${s}`
  if (e) return `Until ${e}`
  return ''
}
export const assignmentDates = (a: Assignment) => dateRange(a.start, a.end, a.active)

// ---------- status ----------
export type Tone = 'success' | 'warning' | 'neutral' | 'danger'
export function statusTone(status: string): Tone {
  if (['active', 'won', 'current'].includes(status)) return 'success'
  if (['planned', 'on-hold', 'submitted', 'draft'].includes(status)) return 'warning'
  if (['lost', 'cancelled', 'withdrawn'].includes(status)) return 'danger'
  return 'neutral'
}

// ---------- people ----------
/** Who to talk to first: sponsors, then product owners and primary users, then leads and architects. */
export function roleRank(role: string) {
  const r = role.toLowerCase()
  if (/sponsor|leadership|cto/.test(r)) return 0
  if (/product manager|primary user|owner|engagement lead/.test(r)) return 1
  if (/lead|architect|manager/.test(r)) return 2
  return 3
}
export const isKeyContact = (role: string) => roleRank(role) <= 1

/** Ids of the notes of some types, sorted by title. */
export const idsOfType = (tree: Tree, ...types: string[]) =>
  Object.keys(tree.nodes).filter((id) => types.includes(tree.nodes[id].type))
    .sort((a, b) => tree.nodes[a].title.localeCompare(tree.nodes[b].title))

/** The account at the root of the tree. */
export const accountId = (tree: Tree) => {
  const r = tree.layout.roots[0]
  return r ? tree.layout.slots[r].id : null
}
/** "GE Healthcare" in the internal and client views, "J2W" in the showcase. */
export const brandName = (tree: Tree) => {
  if (tree.view === 'showcase') return 'J2W'
  const a = accountId(tree)
  return a ? tree.nodes[a].title : tree.title.replace(/ map$/, '')
}
export const sideLabel = (tree: Tree, ours: boolean) => (ours ? 'J2W people' : `${brandName(tree)} people`)

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
