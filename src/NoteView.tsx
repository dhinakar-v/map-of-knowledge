import { useMemo } from 'react'
import { Icon } from './Icon'
import { useNote } from './hooks'
import { useNav } from './nav'
import { Badge, EntityLink, TypeIcon } from './pages/common'
import type { MapNode, Tree } from './types'
import { assignmentDates, dateRange, fmtDate, label, plural, prefersReducedMotion, prop, typeLabel } from './util'

// Shown as chips at the top, or in the sub line, so not repeated in the field list.
const FACT_KEYS = new Set(['status', 'start', 'end', 'role', 'sector', 'duration'])
// About the note rather than the thing: folded away, internal view only.
const META_KEYS = new Set(['owner', 'visibility', 'updated', 'showcase', 'showcase-title', 'showcase-avoid', 'file'])
const LABELS: Record<string, string> = {
  'job-title': 'Job title', owner: 'Note kept by', visibility: 'Shown to client', updated: 'Last updated',
  'showcase-avoid': 'Names hidden in case studies', 'showcase-title': 'Case study title', showcase: 'Published as case study',
  'from-proposal': 'Origin', 'j2w-team': 'J2W team', tech: 'Technology', kind: 'Kind', seniority: 'Seniority',
  influence: 'Influence', organisation: 'Organisation', capabilities: 'Capabilities', since: 'Working together since',
}
const TYPE_ORDER = ['department', 'project', 'team', 'stakeholder', 'person', 'proposal', 'document', 'outcome', 'lesson']
const fieldLabel = (k: string) => LABELS[k] ?? label(k)
const fieldValue = (k: string, v: string) => {
  if (k === 'visibility') return v === 'client' ? 'Yes' : 'No'
  if (k === 'showcase') return v === 'True' || v === 'true' ? 'Yes' : 'No (draft)'
  if (k === 'updated') return fmtDate(v)
  if (k === 'date' || k === 'submitted' || k === 'decided') return /^\d{4}-\d{2}$/.test(v) ? v.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${y}`) : v
  if (['kind', 'seniority', 'influence'].includes(k)) return v.charAt(0).toUpperCase() + v.slice(1)
  return v
}

/** Body HTML: drop the leading "Summary" heading (the summary reads as the lead) and give section headings ids. */
function prepare(html: string) {
  const body = html.replace(/^\s*<h[23]>Summary<\/h[23]>\s*/, '')
  const toc: { id: string; text: string }[] = []
  const out = body.replace(/<h3>(.*?)<\/h3>/g, (_, inner: string) => {
    const id = `sec-${toc.length + 1}`
    toc.push({ id, text: inner.replace(/<[^>]+>/g, '') })
    return `<h3 id="${id}">${inner}</h3>`
  })
  return { html: out, toc }
}

function groupChildren(tree: Tree, n: MapNode) {
  const m = new Map<string, string[]>()
  for (const c of n.children.filter((x) => tree.nodes[x])) {
    const t = tree.nodes[c].type
    m.set(t, [...(m.get(t) ?? []), c])
  }
  return [...m.entries()]
}

export default function NoteView({ tree, id, mode }: { tree: Tree; id: string; mode: 'panel' | 'page' }) {
  const nav = useNav()
  const { note, error } = useNote(tree, id)
  const n = tree.nodes[id]
  const internal = tree.view === 'internal'
  const body = useMemo(() => prepare(note?.body_html ?? ''), [note])
  if (!n) return <p className="muted">This item is not in this view.</p>

  const crumbs: string[] = []
  for (let p = n.parent; p && tree.nodes[p]; p = tree.nodes[p].parent) crumbs.unshift(p)
  const when = dateRange(prop(n, 'start'), prop(n, 'end'), n.status !== 'completed' && n.status !== 'cancelled')
  const people = n.assignments
  const fields = n.props.filter(([k]) => !FACT_KEYS.has(k) && !META_KEYS.has(k))
  const meta = internal ? n.props.filter(([k]) => META_KEYS.has(k)) : []
  const assigned = new Set((people ?? []).flatMap((a) => [a.in, a.team ?? '']))
  const linked = n.neighbours.filter((x) => tree.nodes[x] && x !== n.parent && !n.children.includes(x) && !assigned.has(x) && x !== n.led_to)
  // Children and other linked items in one list per type (a project's own teams and the standing teams on it together)
  const related = [...[...groupChildren(tree, n).flatMap(([, ids]) => ids), ...linked]
    .reduce((m, x) => m.set(tree.nodes[x].type, [...(m.get(tree.nodes[x].type) ?? []), x]), new Map<string, string[]>())]
    .sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]))
  const showcase = tree.view === 'showcase'
  const Title = mode === 'page' ? 'h1' : 'h2'
  const go = (x: string) => (mode === 'page'
    ? <EntityLink tree={tree} id={x} page />
    : <EntityLink tree={tree} id={x} />)

  const main = (
    <div>
      {crumbs.length > 0 && (
        <nav className="crumbs" aria-label="Breadcrumb">
          <ol>
            {crumbs.map((c, i) => (
              <li key={c}>
                {i > 0 && <Icon name="caret-right" size={10} />}
                {mode === 'page'
                  ? <a className="link" style={{ color: 'var(--fg-muted)', textDecoration: 'none' }} href={nav.href('note', c)}>{tree.nodes[c].title}</a>
                  : <button type="button" data-go={c}>{tree.nodes[c].title}</button>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <span className="typeline"><TypeIcon type={n.type} />{tree.view === 'showcase' && n.type === 'project' ? 'Case study' : typeLabel(n.type)}</span>
      <Title className="dtitle" tabIndex={mode === 'page' ? -1 : undefined}>{n.title}</Title>
      {n.sub && n.sub !== n.status && n.sub !== prop(n, 'sector') && <div className="dsub">{n.sub}</div>}
      <div className="facts">
        {n.status && !showcase && !(people && n.status === 'active') && <Badge status={n.status} />}
        {when && <span className="fact num">{when}</span>}
        {prop(n, 'sector') && <span className="fact">{prop(n, 'sector')}</span>}
        {prop(n, 'duration') && <span className="fact">{prop(n, 'duration')}</span>}
        {n.file && (
          <a className="btn sm" href={n.file.startsWith('https://') ? n.file : `documents/${encodeURIComponent(n.file)}`}
            target={n.file.startsWith('https://') ? '_blank' : undefined} rel="noopener">
            <Icon name={n.file.startsWith('https://') ? 'arrow-square-out' : 'download-simple'} />
            {n.file.startsWith('https://') ? 'Open document' : 'Download'}
          </a>
        )}
      </div>

      {people && people.length > 0 && (
        <section className="dsection" aria-label="Works on">
          <h3>{internal ? 'Assignments' : 'Works on'}</h3>
          <ul className="works">
            {people.map((a, i) => (
              <li key={i} className={a.active ? undefined : 'past'}>
                <span className="p">{tree.nodes[a.in] ? go(a.in) : a.in_title}</span>
                {a.team_title && <span className="s">{a.team_title}</span>}
                <span className="s">{[a.role, assignmentDates(a), a.active ? '' : 'past'].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {n.led_to && tree.nodes[n.led_to] && (
        <section className="dsection"><h3>Led to</h3>{go(n.led_to)}</section>
      )}

      {error && <p className="callout danger" role="alert">{error}</p>}
      {!note && !error && <p className="loading" role="status">Loading…</p>}
      {/* body_html is built from the notes on the server, which escapes all note text */}
      {body.html && <div className="note" dangerouslySetInnerHTML={{ __html: body.html }} />}

      {fields.length > 0 && (
        <section className="dsection">
          <h3>Facts</h3>
          <dl className="props">
            {fields.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{fieldLabel(k)}</dt><dd>{fieldValue(k, v)}</dd></div>)}
          </dl>
        </section>
      )}
      {related.map(([t, ids]) => (
        <section key={t} className="dsection">
          <h3>{plural(t)} <span className="count">{ids.length}</span></h3>
          <ul className="list">{ids.map((c) => <li key={c}>{go(c)}{tree.nodes[c].sub && <span className="muted small">{tree.nodes[c].sub}</span>}</li>)}</ul>
        </section>
      ))}
      {meta.length > 0 && (
        <details className="about">
          <summary>About this page</summary>
          <dl className="props">
            {meta.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{fieldLabel(k)}</dt><dd>{fieldValue(k, v)}</dd></div>)}
          </dl>
        </details>
      )}
    </div>
  )

  if (mode === 'panel') return main
  // Same wrapper while loading and after, so the focused heading is not replaced.
  return (
    <div className="notepage">
      {main}
      {body.toc.length >= 3 && <nav className="toc" aria-label="On this page">
        <h2>On this page</h2>
        <ol>
          {body.toc.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} onClick={(e) => {
                e.preventDefault()
                document.getElementById(t.id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
              }}>{t.text}</a>
            </li>
          ))}
        </ol>
      </nav>}
    </div>
  )
}
