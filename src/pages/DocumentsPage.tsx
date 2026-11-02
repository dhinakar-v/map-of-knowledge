import { Icon } from '../Icon'
import type { Tree } from '../types'
import { fmtMonth, idsOfType, prop, titleCase } from '../util'
import { Badge, Block, EntityLink, PageHead } from './common'

function Download({ file, title }: { file?: string; title: string }) {
  if (!file) return null
  const external = file.startsWith('https://')
  return (
    <a className="iconbtn sm" href={external ? file : `documents/${encodeURIComponent(file)}`}
      target={external ? '_blank' : undefined} rel="noopener"
      aria-label={`${external ? 'Open' : 'Download'} ${title}`} title={external ? 'Open' : `Download ${file}`}>
      <Icon name={external ? 'arrow-square-out' : 'download-simple'} />
    </a>
  )
}

function Table({ tree, ids, selected, withLedTo }: { tree: Tree; ids: string[]; selected: string | null; withLedTo?: boolean }) {
  const N = tree.nodes
  return (
    <table className="data">
      <colgroup>
        <col style={{ width: withLedTo ? '34%' : '46%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} />
        <col style={{ width: '14%' }} />{withLedTo && <col style={{ width: '18%' }} />}<col style={{ width: '6%' }} />
      </colgroup>
      <thead>
        <tr><th>Title</th><th>Kind</th><th>Status</th><th>Date</th>{withLedTo && <th>Led to</th>}<th><span className="sr-only">File</span></th></tr>
      </thead>
      <tbody>
        {ids.map((id) => {
          const n = N[id]
          const date = fmtMonth(prop(n, 'date') || prop(n, 'decided') || prop(n, 'submitted'))
          return (
            <tr key={id} className={selected === id ? 'sel' : undefined}>
              <td className="primary"><EntityLink tree={tree} id={id} /></td>
              <td data-label="Kind">{titleCase(prop(n, 'kind') || n.type)}</td>
              <td data-label="Status"><Badge status={n.status} /></td>
              <td data-label="Date" className="num">{date || <><span className="muted" aria-hidden="true">—</span><span className="sr-only">not recorded</span></>}</td>
              {withLedTo && <td data-label="Led to">{n.led_to ? <EntityLink tree={tree} id={n.led_to} /> : <span className="muted">—</span>}</td>}
              <td className="actions"><Download file={n.file} title={n.title} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function DocumentsPage({ tree, selected }: { tree: Tree; selected: string | null }) {
  const N = tree.nodes
  const docs = idsOfType(tree, 'document')
  const proposals = idsOfType(tree, 'proposal')
  const byPlace = new Map<string, string[]>()
  for (const d of docs) {
    const place = N[d].parent ?? ''
    byPlace.set(place, [...(byPlace.get(place) ?? []), d])
  }
  return (
    <>
      <PageHead title="Documents">Charters, designs and proposals, current and archived.</PageHead>
      {[...byPlace.entries()].sort((a, b) => (N[a[0]]?.title ?? '').localeCompare(N[b[0]]?.title ?? '')).map(([place, ids]) => (
        <Block key={place} title={N[place]?.title ?? 'Other'} count={ids.length}>
          <Table tree={tree} ids={ids} selected={selected} />
        </Block>
      ))}
      {!docs.length && <p className="empty-state">No documents recorded yet.</p>}
      <Block title="Proposals" count={proposals.length} id="proposals">
        {proposals.length ? <Table tree={tree} ids={proposals} selected={selected} withLedTo />
          : <p className="empty-state">No proposals recorded yet.</p>}
      </Block>
    </>
  )
}
