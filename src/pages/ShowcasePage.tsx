import { useMemo } from 'react'
import { Icon } from '../Icon'
import { useStored } from '../hooks'
import { useNav } from '../nav'
import type { Tree } from '../types'
import { PAST_PROJECT, prop } from '../util'
import { PageHead } from './common'

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

function CaseCard({ tree, id }: { tree: Tree; id: string }) {
  const nav = useNav()
  const n = tree.nodes[id]
  const caps = splitList(prop(n, 'capabilities'))
  const state = PAST_PROJECT.includes(n.status) ? 'Delivered' : 'Ongoing'
  return (
    <article className="card case">
      <h3><a className="entity" href={nav.href('note', id)}><span className="t">{n.title}</span></a></h3>
      <div className="meta">
        {prop(n, 'sector') && <span>{prop(n, 'sector')}</span>}
        <span>{prop(n, 'duration') || state}</span>
      </div>
      <p className="summary">{n.summary}</p>
      {caps.length > 0 && <p className="tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{caps.map((c) => <span key={c} className="tag">{c}</span>)}</p>}
      <p><a className="link" href={nav.href('note', id)}>Read the case study <Icon name="arrow-right" /></a></p>
    </article>
  )
}

export default function ShowcasePage({ tree }: { tree: Tree }) {
  const cases = tree.layout.roots.map((k) => tree.layout.slots[k].id).filter((id) => tree.nodes[id])
  const capabilities = useMemo(() => [...new Set(cases.flatMap((id) => splitList(prop(tree.nodes[id], 'capabilities'))))].sort(), [cases, tree])
  const [cap, setCap] = useStored(tree.view, 'capability', '')
  const shown = cases.filter((id) => !cap || splitList(prop(tree.nodes[id], 'capabilities')).includes(cap))

  return (
    <>
      <PageHead title="Case studies">Work J2W has delivered. Client names are left out on purpose.</PageHead>
      {capabilities.length > 0 && (
        <div className="toolbar" role="group" aria-label="Filter by capability">
          <button className="chip" aria-pressed={!cap} onClick={() => setCap('')}>All</button>
          {capabilities.map((c) => (
            <button key={c} className="chip" aria-pressed={cap === c} onClick={() => setCap(cap === c ? '' : c)}>{c}</button>
          ))}
        </div>
      )}
      <div className="cards">
        {shown.map((id) => <CaseCard key={id} tree={tree} id={id} />)}
      </div>
      {!cases.length && <p className="empty-state">No case studies are published yet.</p>}
    </>
  )
}
