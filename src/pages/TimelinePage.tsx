import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useStored } from '../hooks'
import type { Timeline, TimelineEvent, Tree } from '../types'
import { monthName, plural } from '../util'
import { PageHead, TypeIcon } from './common'

// Milestones lead their month; people joining or leaving are grouped per place.
const LEAD_KINDS = ['account', 'department', 'project', 'proposal', 'document', 'outcome']
const PEOPLE_KINDS = ['person', 'stakeholder']

type Line = { kind: 'event'; e: TimelineEvent } | { kind: 'group'; place: string; verb: string; evs: TimelineEvent[] }

function lines(evs: TimelineEvent[]): Line[] {
  const out: Line[] = evs.filter((e) => LEAD_KINDS.includes(e.kind)).map((e) => ({ kind: 'event', e }))
  const groups = new Map<string, TimelineEvent[]>()
  for (const e of evs.filter((x) => PEOPLE_KINDS.includes(x.kind))) {
    const k = `${e.verb}|${e.place}`
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  for (const [k, g] of groups) {
    const [verb, place] = k.split('|')
    if (g.length === 1) out.push({ kind: 'event', e: g[0] })
    else out.push({ kind: 'group', place, verb, evs: g })
  }
  return out
}

function EventLine({ tree, e, lead }: { tree: Tree; e: TimelineEvent; lead?: boolean }) {
  const linked = !!tree.nodes[e.id]
  const name = e.person ?? e.text
  const rest = e.person ? e.text.slice(e.person.length) : ''
  return (
    <li className={lead ? 'lead-ev' : undefined}>
      <TypeIcon type={e.kind} />
      <span>
        {linked ? <button type="button" className="entity" data-go={e.id}><span className="t">{name}</span></button> : name}
        {rest && <span className="rest">{rest}</span>}
      </span>
    </li>
  )
}

export default function TimelinePage({ tree }: { tree: Tree }) {
  const [data, setData] = useState<Timeline | null>(null)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useStored<string[]>(tree.view, 'timelineHidden', [])

  useEffect(() => {
    let cancelled = false
    api.timeline().then(
      (t) => { if (!cancelled) setData(t) },
      (e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the timeline.') },
    )
    return () => { cancelled = true }
  }, [])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of [...(data?.events ?? []), ...(data?.undated ?? [])]) m.set(e.kind, (m.get(e.kind) ?? 0) + 1)
    return [...m.entries()]
  }, [data])
  const years = useMemo(() => {
    const m = new Map<string, Map<string, TimelineEvent[]>>()
    for (const e of data?.events ?? []) {
      if (hidden.includes(e.kind)) continue
      const y = e.month.slice(0, 4)
      const mo = e.month.length > 4 ? e.month : `${y}-00`
      if (!m.has(y)) m.set(y, new Map())
      const ym = m.get(y)!
      ym.set(mo, [...(ym.get(mo) ?? []), e])
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [data, hidden])
  const undated = (data?.undated ?? []).filter((e) => !hidden.includes(e.kind))

  return (
    <>
      <PageHead title="Timeline">The account's history from the dates in the notes. Newest first.</PageHead>
      {error && <p className="callout danger" role="alert">{error}</p>}
      {!data && !error && <p className="loading" role="status">Loading…</p>}
      {data && (
        <>
          <div className="toolbar" role="group" aria-label="Show event types">
            {counts.map(([k, c]) => (
              <button key={k} className="chip" aria-pressed={!hidden.includes(k)}
                onClick={() => setHidden(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k])}>
                <TypeIcon type={k} />
                {plural(k)} <span className="count">{c}</span>
              </button>
            ))}
          </div>
          <div className="timeline">
            {years.map(([y, months]) => (
              <section key={y} aria-label={y}>
                <h2 className="year">{y}</h2>
                {[...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([m, evs]) => (
                  <div key={m} className="month">
                    <span className="mlabel">{m.endsWith('-00') ? y : monthName(m)}</span>
                    <ul>
                      {lines(evs).map((l, i) => l.kind === 'event'
                        ? <EventLine key={i} tree={tree} e={l.e} lead={LEAD_KINDS.includes(l.e.kind)} />
                        : (
                          <li key={i}>
                            <TypeIcon type={l.evs[0].kind} />
                            <details>
                              <summary>{l.evs.length} people {l.verb === 'joins' ? 'joined' : 'left'} {tree.nodes[l.place]?.title ?? l.place}</summary>
                              <ul>{l.evs.map((e, j) => <EventLine key={j} tree={tree} e={e} />)}</ul>
                            </details>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
            {!years.length && <p className="empty-state">No dated events yet.</p>}
          </div>
          {undated.length > 0 && (
            <details className="card" style={{ marginTop: 24 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Date not recorded yet ({undated.length})</summary>
              <ul className="list" style={{ marginTop: 8 }}>
                {undated.map((e, i) => <EventLine key={i} tree={tree} e={e} />)}
              </ul>
            </details>
          )}
        </>
      )}
    </>
  )
}
