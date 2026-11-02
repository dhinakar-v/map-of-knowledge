import { useMemo, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { useStored } from '../hooks'
import { useNav } from '../nav'
import type { MapNode, Tree } from '../types'
import { accountId, brandName, dateRange, fmtDate, idsOfType, isPastProject, prop, roleRank } from '../util'
import { daysAgo, localDate, recordVisit } from '../visits'
import { Badge, Block, EntityLink, PageHead } from './common'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const known = (s: string) => (s && !/TODO/i.test(s) ? s : '')
const CHANGED_SHOWN = 8

/** People with an active assignment on a project, best contact first. */
function leadsOn(tree: Tree, project: string, type: 'person' | 'stakeholder') {
  return idsOfType(tree, type)
    .map((id) => ({ id, a: (tree.nodes[id].assignments ?? []).find((x) => x.in === project && x.active) }))
    .filter((x) => x.a)
    .sort((x, y) => roleRank(x.a!.role) - roleRank(y.a!.role) || tree.nodes[x.id].title.localeCompare(tree.nodes[y.id].title))
}

export default function StartPage({ tree }: { tree: Tree }) {
  const acct = accountId(tree)
  if (!acct) return <p className="empty-state">Nothing to show in this view yet.</p>
  return tree.view === 'internal' ? <InternalStart tree={tree} acct={acct} /> : <ClientOverview tree={tree} acct={acct} />
}

interface Step {
  /** stable id: progress is saved by id, so steps can be reordered or added */
  id: string
  title: string
  why: ReactNode
  items: ReactNode[]
  /** shown instead of the items when there are none */
  empty?: string
  actions: { label: string; href: string }[]
}

function InternalStart({ tree, acct }: { tree: Tree; acct: string }) {
  const nav = useNav()
  const N = tree.nodes
  const a = N[acct]
  const brand = brandName(tree)
  const projects = idsOfType(tree, 'project')
  const current = projects.filter((id) => !isPastProject(N[id]))
  const past = projects.filter((id) => isPastProject(N[id]))
  const activeOf = (id: string) => (N[id].assignments ?? []).some((x) => x.active)
  const ours = idsOfType(tree, 'person').filter(activeOf)
  const theirs = idsOfType(tree, 'stakeholder').filter(activeOf)
  const departments = idsOfType(tree, 'department')
  const proposals = idsOfType(tree, 'proposal')
  const docs = idsOfType(tree, 'document').filter((id) => N[id].status === 'current')

  const best = (ids: string[], max: number, limit: number) => ids
    .map((id) => {
      const as = (N[id].assignments ?? []).filter((x) => x.active)
      const rank = Math.min(...as.map((x) => roleRank(x.role)))
      return { id, rank, role: [...new Set(as.map((x) => x.role).filter(Boolean))].join(', ') }
    })
    .filter((x) => x.rank <= max)
    .sort((x, y) => x.rank - y.rank || N[x.id].title.localeCompare(N[y.id].title))
    .slice(0, limit)
  const person = (k: { id: string; role: string }) => (
    <span key={k.id} className="item"><EntityLink tree={tree} id={k.id} icon={false} />{k.role && <span className="muted"> · {k.role}</span>}</span>
  )
  const withStatus = (id: string) => <span key={id} className="item"><EntityLink tree={tree} id={id} /><Badge status={N[id].status} /></span>
  const industry = known(prop(a, 'industry'))

  const steps: Step[] = [
    {
      id: 'account', title: 'The account',
      why: <>{industry && <>{industry}. </>}What {brand} does, how it is organised and how J2W came to work here.</>,
      items: departments.map((id) => <span key={id} className="item"><EntityLink tree={tree} id={id} /></span>),
      actions: [{ label: 'Read the account page', href: nav.href('note', acct) }],
    },
    {
      id: 'projects', title: `Current projects and how they run (${current.length})`,
      why: "Cadence, escalation and the solution are on each project's page.",
      items: current.map(withStatus), empty: 'No current projects recorded yet.',
      actions: [{ label: 'Projects', href: nav.href('projects') }],
    },
    {
      id: 'client', title: `Who to talk to at ${brand}`,
      why: 'The sponsors and owners to know first.',
      items: best(theirs, 1, 5).map(person), empty: 'No key contacts recorded yet.',
      actions: [{ label: `All ${brand} people`, href: nav.href('people', '', 'side=client') }],
    },
    {
      id: 'team', title: `Our team (${ours.length})`,
      why: 'Who leads the J2W work and who does what.',
      items: best(ours, 2, 5).map(person), empty: 'No J2W people recorded yet.',
      actions: [{ label: 'All J2W people', href: nav.href('people', '', 'side=ours') }],
    },
    {
      id: 'docs', title: 'Where the documents are',
      why: <>{plural(docs.length, 'current document')}: charters, designs and plans. Ask, in the header, answers questions from the notes.</>,
      items: docs.slice(0, 4).map((id) => <span key={id} className="item"><EntityLink tree={tree} id={id} /></span>),
      actions: [{ label: 'Documents', href: nav.href('documents') }],
    },
    {
      id: 'history', title: 'What happened before',
      why: `${plural(past.length, 'past project')}, the people who worked on them and what came out of them.`,
      items: past.map(withStatus),
      actions: [
        { label: 'Timeline', href: nav.href('timeline') },
        { label: 'People who worked here before', href: nav.href('people', '', 'when=past') },
      ],
    },
    {
      id: 'proposals', title: 'How the work was won',
      why: 'The proposals J2W made, their result and the project each one led to.',
      items: proposals.map(withStatus), empty: 'No proposals recorded yet.',
      actions: [{ label: 'Proposals', href: nav.href('documents', '', 'at=proposals') }],
    },
  ]

  const [saved, setSaved] = useStored<unknown>(tree.view, `steps:${acct}`, [])
  const [open, setOpen] = useState<Record<string, boolean>>({})  // finished steps shown again
  const done = new Set(Array.isArray(saved) ? saved.filter((x) => steps.some((s) => s.id === x)) : [])
  const toggle = (id: string) => {
    const next = new Set(done)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSaved([...next])
    setOpen((o) => ({ ...o, [id]: false }))
  }
  const allDone = done.size === steps.length

  return (
    <>
      <PageHead title="Start here">Your guide to the {brand} account.</PageHead>
      <p className="lead">{a.summary}</p>
      <nav className="stat-tiles" aria-label="The account at a glance">
        <a className="stat" href={nav.href('projects')}><b>{current.length}</b> <span>current {current.length === 1 ? 'project' : 'projects'}</span></a>
        <a className="stat" href={nav.href('projects', '', 'at=past')}><b>{past.length}</b> <span>past {past.length === 1 ? 'project' : 'projects'}</span></a>
        <a className="stat" href={nav.href('people', '', 'side=ours')}><b>{ours.length}</b> <span>J2W people</span></a>
        <a className="stat" href={nav.href('people', '', 'side=client')}><b>{theirs.length}</b> <span>{brand} people</span></a>
        <a className="stat" href={nav.href('documents', '', 'at=proposals')}><b>{proposals.length}</b> <span>{proposals.length === 1 ? 'proposal' : 'proposals'}</span></a>
      </nav>

      <div className="start-cols">
        <section className="start-steps" aria-labelledby="steps-h">
          <h2 className="h2" id="steps-h">Your first week</h2>
          <div className="progress">
            <span className="bar" role="progressbar" aria-label="First week progress" aria-valuemin={0}
              aria-valuemax={steps.length} aria-valuenow={done.size} aria-valuetext={`${done.size} of ${steps.length} done`}>
              <i className={allDone ? 'complete' : undefined} style={{ width: `${(done.size / steps.length) * 100}%` }} />
            </span>
            <span className="num" aria-live="polite">{done.size} of {steps.length} done</span>
            <span className="small">Saved in this browser</span>
            {done.size > 0 && <button type="button" className="link small" onClick={() => { setSaved([]); setOpen({}) }}>Start over</button>}
          </div>
          {allDone && (
            <p className="callout"><Icon name="check-circle" />First week done. The Map and People pages are the place to go from here.</p>
          )}
          <ol className="steps">
            {steps.map((s, i) => {
              const on = done.has(s.id)
              const show = !on || open[s.id]
              return (
                <li key={s.id} className={on ? 'done' : undefined}>
                  <div className="step-head">
                    <span className="n" aria-hidden="true">{on ? <Icon name="check" /> : i + 1}</span>
                    <h3 id={`step-${s.id}`}>{s.title}</h3>
                    {on && (
                      <button type="button" className="btn ghost sm" aria-expanded={!!open[s.id]} aria-controls={`step-body-${s.id}`}
                        onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>{open[s.id] ? 'Hide' : 'Show'}</button>
                    )}
                    <button type="button" className="chip done-toggle" aria-pressed={on} aria-label={`Mark done: ${s.title}`}
                      onClick={() => toggle(s.id)}>
                      <Icon name={on ? 'check-circle' : 'circle'} />{on ? 'Done' : 'Mark done'}
                    </button>
                  </div>
                  {show && (
                    <div className="step-body" id={`step-body-${s.id}`}>
                      <p className="why">{s.why}</p>
                      {s.items.length > 0 ? <div className="items">{s.items}</div>
                        : s.empty && <p className="why"><span className="gapdot" aria-hidden="true" /> {s.empty}</p>}
                      <div className="actions">
                        {s.actions.map((x) => <a key={x.label} className="btn sm" href={x.href}>{x.label}<Icon name="arrow-right" /></a>)}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        <div className="start-side">
          <WhatChanged tree={tree} />
          <Gaps tree={tree} current={current} />
        </div>
      </div>
    </>
  )
}

/** Notes updated since the previous day this browser opened the page (or a chosen date), newest first. */
function WhatChanged({ tree }: { tree: Tree }) {
  const [initial] = useState(() => recordVisit() || daysAgo(30))
  const [chosen, setChosen] = useState(initial)
  const [all, setAll] = useState(false)
  const since = chosen || initial
  const changed = useMemo(() => Object.values(tree.nodes)
    .filter((n) => n.updated && n.updated >= since)
    .sort((x, y) => (y.updated ?? '').localeCompare(x.updated ?? '') || x.title.localeCompare(y.title)), [tree.nodes, since])
  const days = new Map<string, MapNode[]>()
  for (const n of changed.slice(0, all ? undefined : CHANGED_SHOWN)) days.set(n.updated!, [...(days.get(n.updated!) ?? []), n])

  return (
    <section className="card side-card" aria-labelledby="changed-h">
      <div className="head">
        <h2 className="h2" id="changed-h">What changed</h2>
        <label className="field small">Since
          <input type="date" className="sm" value={since} max={localDate()} onChange={(e) => setChosen(e.target.value)} />
        </label>
      </div>
      {changed.length ? (
        <>
          <p className="muted small">{plural(changed.length, 'note')} updated since {fmtDate(since)}.</p>
          {[...days.entries()].map(([day, notes]) => (
            <div key={day} className="day">
              <h3>{fmtDate(day)}</h3>
              <ul className="list">
                {notes.map((n) => <li key={n.id}><EntityLink tree={tree} id={n.id} /></li>)}
              </ul>
            </div>
          ))}
          {changed.length > CHANGED_SHOWN && (
            <button type="button" className="btn ghost sm" aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${changed.length}`}
            </button>
          )}
        </>
      ) : <p className="muted">Nothing has changed since {fmtDate(since)}.</p>}
    </section>
  )
}

/** Notes still marked TODO, those about current projects first. */
function Gaps({ tree, current }: { tree: Tree; current: string[] }) {
  const nav = useNav()
  const N = tree.nodes
  const near = (n: MapNode) => current.includes(n.id) || (!!n.parent && current.includes(n.parent))
    || (n.assignments ?? []).some((x) => x.active && current.includes(x.in))
  const gaps = Object.values(N).filter((n) => n.placeholder)
    .sort((x, y) => Number(near(y)) - Number(near(x)) || x.title.localeCompare(y.title))
  if (!gaps.length) return null
  return (
    <section className="card side-card" aria-labelledby="gaps-h">
      <h2 className="h2" id="gaps-h"><span className="gapdot" aria-hidden="true" />Facts not recorded yet</h2>
      <p className="muted small">{plural(gaps.length, 'item')} still marked TODO. Don't rely on {gaps.length === 1 ? 'it' : 'them'} yet.</p>
      <ul className="list">
        {gaps.slice(0, 5).map((n) => <li key={n.id}><EntityLink tree={tree} id={n.id} /></li>)}
      </ul>
      <a className="link small" href={nav.href('map', '', 'gaps=1')}>Show {gaps.length > 5 ? `all ${gaps.length}` : 'them'} on the map</a>
    </section>
  )
}

function ClientOverview({ tree, acct }: { tree: Tree; acct: string }) {
  const N = tree.nodes
  const a = N[acct]
  const brand = brandName(tree)
  const projects = idsOfType(tree, 'project')
  const current = projects.filter((id) => !isPastProject(N[id]))
  const past = projects.filter((id) => isPastProject(N[id]))
  const people = (type: 'person' | 'stakeholder') => new Set(current.flatMap((p) => leadsOn(tree, p, type).map((x) => x.id))).size

  const lead = (p: string, type: 'person' | 'stakeholder') => {
    const l = leadsOn(tree, p, type)[0]
    return l ? <><EntityLink tree={tree} id={l.id} icon={false} /><div className="sub">{l.a!.role}</div></> : <span className="muted">—</span>
  }

  return (
    <>
      <PageHead title="Overview">What J2W does with {brand}.</PageHead>
      <p className="lead">{a.summary}</p>
      <p className="stats">
        {people('person')} J2W people and {people('stakeholder')} {brand} people work on the current projects.
      </p>
      <Block title="Current projects" count={current.length}>
        {current.length ? (
          <table className="data">
            <colgroup><col style={{ width: '26%' }} /><col style={{ width: '12%' }} /><col style={{ width: '28%' }} /><col style={{ width: '17%' }} /><col style={{ width: '17%' }} /></colgroup>
            <thead><tr><th>Project</th><th>Status</th><th>Goal</th><th>{brand} lead</th><th>J2W lead</th></tr></thead>
            <tbody>
              {current.map((id) => {
                const when = dateRange(prop(N[id], 'start'), prop(N[id], 'end'), true)
                return (
                  <tr key={id}>
                    <td className="primary"><EntityLink tree={tree} id={id} page />{when && <div className="sub">{when}</div>}</td>
                    <td data-label="Status"><Badge status={N[id].status} /></td>
                    <td data-label="Goal">{N[id].summary || <span className="muted">—</span>}</td>
                    <td data-label={`${brand} lead`}>{lead(id, 'stakeholder')}</td>
                    <td data-label="J2W lead">{lead(id, 'person')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <p className="empty-state">No current projects to show yet.</p>}
      </Block>
      {past.length > 0 && (
        <Block title="Earlier work" count={past.length}>
          <ul className="list divided">
            {past.map((id) => {
              const when = dateRange(prop(N[id], 'start'), prop(N[id], 'end'), false)
              return <li key={id}><EntityLink tree={tree} id={id} page /><Badge status={N[id].status} />{when && <span className="muted small">{when}</span>}</li>
            })}
          </ul>
        </Block>
      )}
    </>
  )
}
