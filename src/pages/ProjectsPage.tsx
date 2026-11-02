import type { Tree } from '../types'
import { brandName, dateRange, idsOfType, isPastProject, prop } from '../util'
import { Badge, Block, EntityLink, PageHead } from './common'

function ProjectCard({ tree, id }: { tree: Tree; id: string }) {
  const N = tree.nodes
  const p = N[id]
  const internal = tree.view === 'internal'
  const past = isPastProject(p)
  const kids = p.children.filter((c) => N[c])
  const ofType = (t: string) => kids.filter((c) => N[c].type === t)

  // People on this project (for a past project: everyone who was on it)
  const people = idsOfType(tree, 'person', 'stakeholder')
    .filter((pid) => (N[pid].assignments ?? []).some((a) => a.in === id && (past || a.active)))
  const ours = people.filter((pid) => N[pid].type === 'person').length
  // Teams: the project's own, plus standing client teams its people are in
  const teams = [...new Set([...ofType('team'), ...people.flatMap((pid) =>
    (N[pid].assignments ?? []).filter((a) => a.in === id && a.team).map((a) => a.team!))])].filter((t) => N[t])
  const proposals = idsOfType(tree, 'proposal').filter((x) => N[x].led_to === id)
  const fromProposal = prop(p, 'from-proposal')
  const results = [...ofType('outcome'), ...ofType('lesson')]
  const docs = ofType('document')
  const when = dateRange(prop(p, 'start'), prop(p, 'end'), !past)

  return (
    <article className={`card project${past ? ' past' : ''}`}>
      <div className="head">
        <h3><EntityLink tree={tree} id={id} page icon={false} /></h3>
        <Badge status={p.status} />
      </div>
      {(when || p.parent) && (
        <div className="meta">
          {when && <span className="num">{when}</span>}
          {p.parent && N[p.parent] && <span>{N[p.parent].title}</span>}
        </div>
      )}
      {p.summary && <p className="summary">{p.summary}</p>}
      <dl className="kv">
        {people.length > 0 && (
          <><dt>People</dt><dd className="num">{[ours && `${ours} J2W`, people.length - ours && `${people.length - ours} ${brandName(tree)}`].filter(Boolean).join(', ')}{past ? ' (involved)' : ''}</dd></>
        )}
        {teams.length > 0 && <><dt>Teams</dt><dd>{teams.map((t) => <EntityLink key={t} tree={tree} id={t} />)}</dd></>}
        {results.length > 0 && <><dt>Results</dt><dd>{results.map((c) => <EntityLink key={c} tree={tree} id={c} />)}</dd></>}
        {internal && proposals.length > 0 && (
          <><dt>Proposal</dt><dd>{proposals.map((x) => <span key={x} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <EntityLink tree={tree} id={x} /><Badge status={N[x].status} /></span>)}</dd></>
        )}
        {!internal && fromProposal && <><dt>Origin</dt><dd>Started from a {fromProposal}</dd></>}
        {docs.length > 0 && <><dt>Documents</dt><dd>{docs.map((d) => <EntityLink key={d} tree={tree} id={d} />)}</dd></>}
      </dl>
    </article>
  )
}

export default function ProjectsPage({ tree }: { tree: Tree }) {
  const projects = idsOfType(tree, 'project')
  const current = projects.filter((id) => !isPastProject(tree.nodes[id]))
  const past = projects.filter((id) => isPastProject(tree.nodes[id]))
  return (
    <>
      <PageHead title="Projects">
        {tree.view === 'internal'
          ? 'Current and past work on the account. Open a project for how it runs, the solution and its documents.'
          : 'Our current and earlier work together.'}
      </PageHead>
      <Block title="Current" count={current.length}>
        {current.length ? <div className="cards">{current.map((id) => <ProjectCard key={id} tree={tree} id={id} />)}</div>
          : <p className="empty-state">No current projects.</p>}
      </Block>
      <Block title={tree.view === 'internal' ? 'Past' : 'Earlier work'} count={past.length} id="past">
        {past.length ? <div className="cards">{past.map((id) => <ProjectCard key={id} tree={tree} id={id} />)}</div>
          : <p className="empty-state">No past projects recorded yet.</p>}
      </Block>
    </>
  )
}
