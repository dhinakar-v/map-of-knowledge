import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import { TypeIcon } from './pages/common'
import type { MapNode } from './types'
import { plural } from './util'

export type Layout = 'outline' | 'chart'
export type When = 'all' | 'active' | 'past'

interface Props {
  nodes: Record<string, MapNode>
  term: string
  onTerm: (v: string) => void
  layout: Layout
  onLayout: (l: Layout) => void
  when: When
  onWhen: (w: When) => void
  types: string[]
  hiddenTypes: string[]
  onTypes: (hidden: string[]) => void
  orgs: string[]
  org: string
  onOrg: (v: string) => void
  projects: string[]
  proj: string
  onProj: (v: string) => void
  internal: boolean
  gapsOnly: boolean
  onGaps: (v: boolean) => void
  onExpand: () => void
  onCollapse: () => void
  hits: number
  total: number
  active: boolean
  onClear: () => void
}

const WHEN: [When, string][] = [['all', 'All'], ['active', 'Active now'], ['past', 'Past']]

/** The Map page's controls on one row, with the less used filters in a popover, and the active filters as chips. */
export default function Toolbar(p: Props) {
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])
  const extra = p.hiddenTypes.length + (p.org ? 1 : 0) + (p.proj ? 1 : 0) + (p.gapsOnly ? 1 : 0)
  const chips: [string, () => void][] = [
    ...(p.term ? [[`“${p.term}”`, () => p.onTerm('')] as [string, () => void]] : []),
    ...(p.when !== 'all' ? [[WHEN.find((w) => w[0] === p.when)![1], () => p.onWhen('all')] as [string, () => void]] : []),
    ...p.hiddenTypes.map((t) => [`No ${plural(t).toLowerCase()}`, () => p.onTypes(p.hiddenTypes.filter((x) => x !== t))] as [string, () => void]),
    ...(p.org ? [[p.org, () => p.onOrg('')] as [string, () => void]] : []),
    ...(p.proj ? [[p.nodes[p.proj]?.title ?? p.proj, () => p.onProj('')] as [string, () => void]] : []),
    ...(p.gapsOnly ? [['Only items with gaps', () => p.onGaps(false)] as [string, () => void]] : []),
  ]

  return (
    <>
      <div className="maptools" role="group" aria-label="Map controls">
        <label className="searchbox">
          <Icon name="magnifying-glass" />
          <span className="sr-only">Find in the map</span>
          <input type="search" className="sm" placeholder="Find in the map" value={p.term} onChange={(e) => p.onTerm(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Layout">
          <button aria-pressed={p.layout === 'outline'} onClick={() => p.onLayout('outline')}><Icon name="list-bullets" />Outline</button>
          <button aria-pressed={p.layout === 'chart'} onClick={() => p.onLayout('chart')}><Icon name="tree-structure" />Chart</button>
        </div>
        <div className="seg" role="group" aria-label="Active or past">
          {WHEN.map(([w, l]) => <button key={w} aria-pressed={p.when === w} onClick={() => p.onWhen(w)}>{l}</button>)}
        </div>
        <details className="menu" ref={menu}>
          <summary className="btn sm"><Icon name="sliders-horizontal" />Filters{extra > 0 && <span className="count">{extra}</span>}</summary>
          <div className="pop left" style={{ width: 280 }}>
            <div className="group" role="group" aria-labelledby="types-lbl">
              <div className="label" id="types-lbl">Show</div>
              {p.types.map((t) => (
                <label key={t} className="check">
                  <input type="checkbox" checked={!p.hiddenTypes.includes(t)}
                    onChange={() => p.onTypes(p.hiddenTypes.includes(t) ? p.hiddenTypes.filter((x) => x !== t) : [...p.hiddenTypes, t])} />
                  <TypeIcon type={t} />{plural(t)}
                </label>
              ))}
            </div>
            <div className="group" style={{ display: 'grid', gap: 8 }}>
              <label className="field"><span>Organisation</span>
                <select className="sm" value={p.org} onChange={(e) => p.onOrg(e.target.value)}>
                  <option value="">All</option>
                  {p.orgs.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              {p.projects.length > 1 && (
                <label className="field"><span>Project</span>
                  <select className="sm" value={p.proj} onChange={(e) => p.onProj(e.target.value)} style={{ maxWidth: 190 }}>
                    <option value="">All</option>
                    {p.projects.map((id) => <option key={id} value={id}>{p.nodes[id].title}</option>)}
                  </select>
                </label>
              )}
              {p.internal && (
                <label className="check" style={{ padding: 0 }}>
                  <input type="checkbox" checked={p.gapsOnly} onChange={(e) => p.onGaps(e.target.checked)} />
                  <span className="gapdot" aria-hidden="true" />Only items with gaps (TODO)
                </label>
              )}
            </div>
          </div>
        </details>
        <button className="iconbtn sm" aria-label="Expand all" title="Expand all" onClick={p.onExpand}><Icon name="arrows-out-line-vertical" /></button>
        <button className="iconbtn sm" aria-label="Collapse all" title="Collapse all" onClick={p.onCollapse}><Icon name="arrows-in-line-vertical" /></button>
        <span className="end num" role="status">{p.active ? `${p.hits} of ${p.total} items` : `${p.total} items`}</span>
      </div>
      {chips.length > 0 && (
        <div className="activefilters" aria-label="Active filters">
          {chips.map(([l, remove]) => (
            <button key={l} className="chip" onClick={remove} aria-label={`Remove filter: ${l}`}>{l}<Icon name="x" /></button>
          ))}
          <button className="btn ghost sm" onClick={p.onClear}>Clear all</button>
        </div>
      )}
    </>
  )
}
