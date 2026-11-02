import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { useStored } from '../hooks'
import { useNav } from '../nav'
import type { Assignment, Tree } from '../types'
import { assignmentDates, brandName, dateRange, idsOfType, isKeyContact, roleRank, sideLabel } from '../util'
import { EntityLink, PageHead } from './common'

type When = 'now' | 'past' | 'all'
type Group = 'side' | 'project' | 'team'

interface Row { id: string; as: Assignment[] }

const uniq = <T,>(xs: T[]) => [...new Set(xs)]

export default function PeoplePage({ tree, selected }: { tree: Tree; selected: string | null }) {
  const { route } = useNav()
  const internal = tree.view === 'internal'
  const N = tree.nodes
  const brand = brandName(tree)
  const params = new URLSearchParams(route.query)
  const [whenState, setWhen] = useState<When>(() => (params.get('when') === 'past' ? 'past' : 'now'))
  const when: When = internal ? whenState : 'now'  // the client view only has current people
  const [side, setSide] = useState<'all' | 'ours' | 'client'>(() => {
    const s = params.get('side')
    return s === 'ours' || s === 'client' ? s : 'all'
  })
  const [group, setGroup] = useStored<Group>(tree.view, 'peopleGroup2', 'side')
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase()
    const keep = (a: Assignment) => when === 'all' || (when === 'now' ? a.active : !a.active)
    const people = idsOfType(tree, 'person', 'stakeholder').filter((id) =>
      side === 'all' || (side === 'ours') === (N[id].type === 'person'))
    const rows: Row[] = []
    for (const id of people) {
      const as = (N[id].assignments ?? []).filter(keep)
        .filter((a) => !t || [N[id].title, a.role, a.in_title, a.team_title].join(' ').toLowerCase().includes(t))
      if (as.length) rows.push({ id, as })
    }
    const rank = (r: Row) => Math.min(...r.as.map((a) => roleRank(a.role)))
    const byRank = (x: Row, y: Row) => rank(x) - rank(y) || N[x.id].title.localeCompare(N[y.id].title)
    if (group === 'side') {
      const client = rows.filter((r) => N[r.id].type === 'stakeholder').sort(byRank)
      const ours = rows.filter((r) => N[r.id].type === 'person').sort(byRank)
      return [[sideLabel(tree, false), client], [sideLabel(tree, true), ours]].filter(([, rs]) => (rs as Row[]).length) as [string, Row[]][]
    }
    // one row per assignment, grouped by project or team; client people first, then J2W
    const m = new Map<string, Row[]>()
    for (const r of rows) for (const a of r.as) {
      const k = group === 'project' ? a.in_title : (a.team_title || 'No team')
      m.set(k, [...(m.get(k) ?? []), { id: r.id, as: [a] }])
    }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([k, rs]) =>
      [k, rs.sort((x, y) => Number(N[x.id].type === 'person') - Number(N[y.id].type === 'person') || byRank(x, y))] as [string, Row[]])
  }, [tree, N, side, when, group, q])

  const seg = <T extends string>(value: T, set: (v: T) => void, opts: [T, string][], aria: string) => (
    <div className="seg" role="group" aria-label={aria}>
      {opts.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => set(v)}>{l}</button>)}
    </div>
  )
  const total = new Set(groups.flatMap(([, rs]) => rs.map((r) => r.id))).size

  return (
    <>
      <PageHead title="People">
        {internal ? `Who works on the ${brand} account now, and who did before. Key contacts come first.`
          : 'The people on our current work together, from both sides.'}
      </PageHead>
      <div className="toolbar">
        {internal && seg(when, setWhen, [['now', 'Now'], ['past', 'Past'], ['all', 'Everyone']], 'Now or past')}
        {seg(group, setGroup, [['side', 'By side'], ['project', 'By project'], ['team', 'By team']], 'Group by')}
        {seg(side, setSide, [['all', 'Both sides'], ['client', brand], ['ours', 'J2W']], 'Side')}
        <label className="searchbox">
          <Icon name="magnifying-glass" />
          <span className="sr-only">Filter people</span>
          <input type="search" placeholder="Filter by name, role, project" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="end" role="status">{total} {total === 1 ? 'person' : 'people'}</span>
      </div>
      {groups.map(([g, rows]) => {
        const dated = rows.some(({ as }) => as.some((a) => /^\d{4}-\d{2}$/.test(a.start) || /^\d{4}-\d{2}$/.test(a.end)))
        const teamed = group !== 'side' || rows.some(({ as }) => as.some((a) => a.team_title))
        return (
        <section key={g} className="block" aria-label={g}>
          <h2>{g}<span className="count">{rows.length}</span></h2>
          <table className="data">
            <colgroup>
              <col style={{ width: '24%' }} /><col style={{ width: '24%' }} /><col style={{ width: '22%' }} />
              {teamed && <col style={{ width: '16%' }} />}{dated && <col style={{ width: '14%' }} />}
            </colgroup>
            <thead>
              <tr><th>Name</th><th>Role</th><th>{group === 'project' ? 'Team' : 'Project'}</th>
                {teamed && <th>{group === 'side' ? 'Team' : 'Side'}</th>}{dated && <th>When</th>}</tr>
            </thead>
            <tbody>
              {rows.map(({ id, as }, i) => {
                const roles = uniq(as.map((a) => a.role).filter(Boolean))
                const ongoing = as.some((a) => a.active)
                const starts = as.map((a) => a.start).filter((s) => /^\d{4}-\d{2}$/.test(s)).sort()
                const ends = as.map((a) => a.end).filter((s) => /^\d{4}-\d{2}$/.test(s)).sort()
                const when = as.length === 1 ? assignmentDates(as[0]) : dateRange(starts[0] ?? '', ongoing ? '' : ends[ends.length - 1] ?? '', ongoing)
                return (
                  <tr key={`${id}-${i}`} className={selected === id ? 'sel' : undefined}>
                    <td className="primary">
                      <EntityLink tree={tree} id={id} icon={false} />
                      {roles.some(isKeyContact) && ongoing && <span className="keytag">Key contact</span>}
                    </td>
                    <td data-label="Role">{roles.join(', ') || '—'}</td>
                    <td data-label={group === 'project' ? 'Team' : 'Project'}>
                      {group === 'project'
                        ? (as[0].team ? <EntityLink tree={tree} id={as[0].team} icon={false}>{as[0].team_title}</EntityLink> : <span className="muted">—</span>)
                        : <div className="stack">{uniq(as.map((a) => a.in)).map((p) => <EntityLink key={p} tree={tree} id={p} icon={false}>{as.find((a) => a.in === p)!.in_title}</EntityLink>)}</div>}
                    </td>
                    {teamed && <td data-label={group === 'side' ? 'Team' : 'Side'}>
                      {group === 'side'
                        ? (uniq(as.map((a) => a.team_title).filter(Boolean)).join(', ') || <span className="muted">—</span>)
                        : (N[id].type === 'person' ? 'J2W' : brand)}
                    </td>}
                    {dated && <td data-label="When" className="num">{when || <span className="muted">—</span>}{!ongoing && <span className="sub"> · past</span>}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
        )
      })}
      {!groups.length && (
        <div className="empty-state">
          <span>Nobody matches{q ? ` “${q}”` : ''}.</span>
          <button className="btn sm" onClick={() => { setQ(''); setSide('all'); setWhen('now') }}>Clear filters</button>
        </div>
      )}
    </>
  )
}
