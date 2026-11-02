import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { useStored } from '../hooks'
import { useNav } from '../nav'
import Toolbar, { type Layout, type When } from '../Toolbar'
import TreeView, { type Filter } from '../TreeView'
import type { Tree } from '../types'
import { prefersReducedMotion } from '../util'

interface Props {
  tree: Tree
  selected: string | null
  /** a note picked elsewhere (details panel, another page): open its branch and scroll to it */
  reveal: { id: string; n: number } | null
  onSelect: (id: string, opts?: { reveal?: boolean }) => void
}

const clampZoom = (z: number) => Math.min(3, Math.max(0.1, z))
// Fitting the chart never shrinks text below this; the canvas scrolls instead.
const MIN_FIT = 0.6

export default function MapPage({ tree, selected, reveal, onSelect }: Props) {
  const { route } = useNav()
  const view = tree.view
  const N = tree.nodes
  const { roots, slots } = tree.layout
  const keys = useMemo(() => Object.keys(slots), [slots])

  // Parent of each slot, and whether it is past (itself or anything above it).
  const parentKey = useMemo(() => {
    const m: Record<string, string | null> = {}
    for (const r of roots) m[r] = null
    for (const k of keys) for (const c of slots[k].children) m[c] = k
    return m
  }, [roots, keys, slots])
  const past = useMemo(() => {
    const m: Record<string, boolean> = {}
    const walk = (k: string, above: boolean) => {
      m[k] = above || slots[k].past
      for (const c of slots[k].children) walk(c, m[k])
    }
    for (const r of roots) walk(r, false)
    return m
  }, [roots, slots])

  const ids = useMemo(() => [...new Set(keys.map((k) => slots[k].id))], [keys, slots])
  const types = useMemo(() => [...new Set(ids.map((id) => N[id].type))], [ids, N])
  const orgs = useMemo(() => [...new Set(ids.map((id) => N[id].org).filter(Boolean))].sort(), [ids, N])
  const projects = useMemo(() => ids.filter((id) => N[id].type === 'project'), [ids, N])

  // Persisted choices (maptree:<view>:<key>). Projects start collapsed so the first screen shows
  // account > department > projects.
  const projectKeys = useMemo(() => keys.filter((k) => N[slots[k].id].type === 'project'), [keys, slots, N])
  const [collapsedArr, setCollapsedArr] = useStored<string[]>(view, 'collapsed3', projectKeys)
  const [hiddenRaw, setHidden] = useStored<string[]>(view, 'hiddenTypes', [])
  const [orgRaw, setOrg] = useStored(view, 'org', '')
  const [projRaw, setProj] = useStored(view, 'proj', '')
  const [when, setWhen] = useStored<When>(view, 'when', 'all')
  const [layout, setLayoutStored] = useStored<Layout>(view, 'layout', 'outline')

  const collapsed = useMemo(() => new Set(collapsedArr), [collapsedArr])
  const hiddenTypes = useMemo(() => hiddenRaw.filter((t) => types.includes(t)), [hiddenRaw, types])
  const org = orgs.includes(orgRaw) ? orgRaw : ''
  const proj = projects.includes(projRaw) ? projRaw : ''

  const [term, setTerm] = useState('')
  const [gapsOnly, setGapsOnly] = useState(() => view === 'internal' && new URLSearchParams(route.query).get('gaps') === '1')

  // ---------- filters ----------
  // A slot matches when its note passes every active filter. Ancestors of matches stay visible (dimmed)
  // so the tree keeps its shape. "Active now" hides past places and people; "Past" shows only them.
  const t = term.trim().toLowerCase()
  const filter: Filter = useMemo(() => {
    const active = !!(t || org || proj || gapsOnly || hiddenTypes.length || when !== 'all')
    const projectOf = (k: string) => {
      let p: string | null = k
      while (p && N[slots[p].id].type !== 'project') p = parentKey[p]
      return p ? slots[p].id : ''
    }
    const hay = new Map(ids.map((id) => {
      const n = N[id]
      return [id, [n.title, n.sub, n.body_text, ...n.props.map((p) => p[1])].join(' ').toLowerCase()]
    }))
    const hit = new Set<string>()
    const keep = new Set<string>()
    for (const k of keys) {
      const n = N[slots[k].id]
      const ok = (!t || hay.get(n.id)!.includes(t) || (slots[k].role ?? '').toLowerCase().includes(t)) &&
        (!org || n.org === org) && (!proj || projectOf(k) === proj) && (!gapsOnly || n.placeholder) &&
        !hiddenTypes.includes(n.type) && (when === 'all' || (when === 'past') === past[k])
      if (ok) {
        hit.add(k)
        for (let p: string | null = k; p; p = parentKey[p]) keep.add(p)
      }
    }
    return { active, hit, keep, forceOpen: !!proj || when === 'past' || gapsOnly }
  }, [keys, ids, N, slots, parentKey, past, t, org, proj, gapsOnly, hiddenTypes, when])

  // ---------- focus (roving tabindex) and reveal ----------
  const [activeKey, setActiveKey] = useState<string | null>(() => {
    const k = selected ? keys.find((x) => slots[x].id === selected && !past[x]) : null
    return k ?? roots[0] ?? null
  })
  const treeRef = useRef<HTMLDivElement>(null)

  const openTo = useCallback((k: string) => {
    const open = new Set(collapsedArr)
    let changed = false
    for (let p = parentKey[k]; p; p = parentKey[p]) if (open.delete(p)) changed = true
    if (changed) setCollapsedArr([...open])
  }, [collapsedArr, parentKey, setCollapsedArr])

  useEffect(() => {
    if (!reveal) return
    const places = keys.filter((k) => slots[k].id === reveal.id)
    const k = places.find((x) => !past[x]) ?? places[0]
    if (!k) return
    openTo(k)
    setActiveKey(k)
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`li[data-key="${CSS.escape(k)}"] > .node`)
        ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    })
    // runs only when a new reveal arrives
  }, [reveal])

  const setCollapsed = useCallback((k: string, on: boolean) => {
    if (!slots[k]?.children.length) return
    const next = new Set(collapsedArr)
    if (on) next.add(k)
    else next.delete(k)
    setCollapsedArr([...next])
  }, [slots, collapsedArr, setCollapsedArr])

  // ---------- zoom + fit (chart) ----------
  const wrapRef = useRef<HTMLDivElement>(null)
  const fitMode = useRef(true)
  const [zoom, setZoom] = useState(1)

  const fit = useCallback(() => {
    const el = treeRef.current
    const wrap = wrapRef.current
    if (!el || !wrap || layout !== 'chart') return
    el.style.zoom = '1'
    const w = el.offsetWidth || 1
    const cs = getComputedStyle(wrap)
    const aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const z = clampZoom(Math.max(MIN_FIT, Math.min(aw / w, 1)))  // fit the width; scroll vertically
    el.style.zoom = String(z)
    setZoom(z)
  }, [layout])

  // Keep the chart fitted while branches open or close, filters change or the window resizes.
  useLayoutEffect(() => {
    if (layout === 'chart' && fitMode.current) fit()
  }, [layout, fit, collapsedArr, filter, tree])
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => { if (fitMode.current) fit() })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [fit])

  const manualZoom = (f: number) => { fitMode.current = false; setZoom(clampZoom(zoom * f)) }
  const setLayout = (l: Layout) => { if (l === 'chart') fitMode.current = true; setLayoutStored(l) }
  const hitIds = new Set([...filter.hit].map((k) => slots[k].id))

  return (
    <>
      <Toolbar
        nodes={N}
        term={term}
        onTerm={setTerm}
        layout={layout}
        onLayout={setLayout}
        when={when}
        onWhen={setWhen}
        types={types}
        hiddenTypes={hiddenTypes}
        onTypes={setHidden}
        orgs={orgs}
        org={org}
        onOrg={setOrg}
        projects={projects}
        proj={proj}
        onProj={setProj}
        internal={view === 'internal'}
        gapsOnly={gapsOnly}
        onGaps={setGapsOnly}
        onExpand={() => setCollapsedArr([])}
        onCollapse={() => setCollapsedArr(keys.filter((k) => slots[k].children.length && !roots.includes(k)))}
        hits={hitIds.size}
        total={ids.length}
        active={filter.active}
        onClear={() => { setTerm(''); setOrg(''); setProj(''); setHidden([]); setGapsOnly(false); setWhen('all') }}
      />
      <div id="treewrap" ref={wrapRef} className={layout === 'chart' ? 'chartmode' : undefined}>
        {layout === 'chart' && (
          <div className="zoombar" role="group" aria-label="Zoom">
            <button className="iconbtn sm" aria-label="Zoom out" title="Zoom out" onClick={() => manualZoom(0.8)}><Icon name="minus" /></button>
            <output className="zl" aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button className="iconbtn sm" aria-label="Zoom in" title="Zoom in" onClick={() => manualZoom(1.25)}><Icon name="plus" /></button>
            <button className="iconbtn sm" aria-label="Fit to width" title="Fit to width" onClick={() => { fitMode.current = true; fit() }}><Icon name="corners-in" /></button>
          </div>
        )}
        <TreeView
          roots={roots}
          parentKey={parentKey}
          layout={layout}
          zoom={zoom}
          treeRef={treeRef}
          nodes={N}
          slots={slots}
          past={past}
          collapsed={collapsed}
          filter={filter}
          selected={selected}
          activeKey={activeKey}
          term={t}
          showGaps={gapsOnly}
          onSelect={(k) => { setActiveKey(k); onSelect(slots[k].id) }}
          onToggle={(k) => setCollapsed(k, !collapsed.has(k))}
          onActivate={setActiveKey}
          onCollapseKey={setCollapsed}
        />
      </div>
    </>
  )
}
