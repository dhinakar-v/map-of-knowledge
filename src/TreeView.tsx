import type { CSSProperties, KeyboardEvent, RefObject } from 'react'
import { Icon } from './Icon'
import { TypeIcon } from './pages/common'
import type { MapNode, Slot } from './types'
import { titleCase, typeColour, typeLabel } from './util'

/** Filter state over slot keys (a note can sit in several slots). */
export interface Filter {
  active: boolean
  hit: Set<string>
  keep: Set<string>
  /** keep ancestors of a slot open while a project or time filter or a search is showing its matches */
  forceOpen: boolean
}

interface Ctx {
  nodes: Record<string, MapNode>
  slots: Record<string, Slot>
  past: Record<string, boolean>
  collapsed: Set<string>
  filter: Filter
  selected: string | null
  activeKey: string | null
  term: string
  showGaps: boolean
  onSelect: (key: string) => void
  onToggle: (key: string) => void
  onActivate: (key: string) => void
}

function Title({ text, term }: { text: string; term: string }) {
  const k = term ? text.toLowerCase().indexOf(term) : -1
  if (k < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, k)}
      <mark>{text.slice(k, k + term.length)}</mark>
      {text.slice(k + term.length)}
    </>
  )
}

function TreeNode({ k, level, ctx }: { k: string; level: number; ctx: Ctx }) {
  const slot = ctx.slots[k]
  const n = ctx.nodes[slot.id]
  const { filter } = ctx
  const hasKids = slot.children.length > 0
  const kept = filter.keep.has(k)
  const open = filter.active && kept && (!filter.hit.has(k) || filter.forceOpen)
  const isCollapsed = hasKids && ctx.collapsed.has(k) && !open
  const isPast = ctx.past[k]
  const cls = [
    isCollapsed ? 'collapsed' : '',
    filter.active && !kept ? 'hide' : '',
    filter.active && kept && !filter.hit.has(k) ? 'nomatch' : '',
    isPast ? 'past' : '',
  ].filter(Boolean).join(' ')
  const sub = slot.role ?? (n.sub && n.sub === n.status ? titleCase(n.sub) : n.sub)
  const gap = ctx.showGaps && n.placeholder
  const name = [n.title, sub, typeLabel(n.type), isPast ? 'past' : '', gap ? 'has missing information' : '',
    hasKids ? `${slot.children.length} ${slot.children.length === 1 ? 'item' : 'items'} inside` : ''].filter(Boolean).join(', ')

  return (
    <li
      role="treeitem"
      data-key={k}
      data-id={slot.id}
      className={cls || undefined}
      aria-level={level}
      aria-expanded={hasKids ? !isCollapsed : undefined}
      aria-selected={ctx.selected === slot.id}
      aria-label={name}
      tabIndex={ctx.activeKey === k ? 0 : -1}
      onFocus={(e) => { if (e.target === e.currentTarget) ctx.onActivate(k) }}
    >
      <div
        className="node"
        style={{ '--tc': typeColour(n.type) } as CSSProperties}
        onClick={(e) => { (e.currentTarget.parentElement as HTMLElement).focus({ preventScroll: true }); ctx.onSelect(k) }}
      >
        <button
          className={`caret${hasKids ? '' : ' leaf'}`}
          aria-hidden="true"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); ctx.onToggle(k) }}
        >
          <Icon name="caret-down" size={14} />
        </button>
        <TypeIcon type={n.type} />
        <span className="t"><Title text={n.title} term={ctx.term} /></span>
        {sub && <span className="sub">{sub}{isPast && !/^(Completed|Cancelled|Past)$/.test(sub) ? ' · past' : ''}</span>}
        {gap && <span className="gapdot" title="Missing information (TODO)" />}
        {hasKids && isCollapsed && <span className="more" title={`${slot.children.length} items inside`}>+{slot.children.length}</span>}
      </div>
      {hasKids && (
        <ul role="group">
          {slot.children.map((c) => <TreeNode key={c} k={c} level={level + 1} ctx={ctx} />)}
        </ul>
      )}
    </li>
  )
}

interface Props extends Ctx {
  roots: string[]
  parentKey: Record<string, string | null>
  layout: 'outline' | 'chart'
  zoom: number
  treeRef: RefObject<HTMLDivElement | null>
  onCollapseKey: (key: string, on: boolean) => void
}

export default function TreeView({ roots, parentKey, layout, zoom, treeRef, onCollapseKey, ...ctx }: Props) {
  // Keyboard (WAI-ARIA tree): arrows move focus, Right/Left open/close or go to child/parent,
  // Home/End jump, Enter/Space shows the item's details.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[role="treeitem"]')
    if (!li || e.target !== li) return
    const k = li.dataset.key!
    const visible = [...(treeRef.current?.querySelectorAll<HTMLElement>('li[role="treeitem"]') ?? [])]
      .filter((el) => el.offsetParent !== null)
    const i = visible.indexOf(li)
    const focus = (el?: HTMLElement | null) => { if (el) { el.focus(); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }) } }
    const expanded = li.getAttribute('aria-expanded')
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focus(visible[i + 1]); break
      case 'ArrowUp': e.preventDefault(); focus(visible[i - 1]); break
      case 'Home': e.preventDefault(); focus(visible[0]); break
      case 'End': e.preventDefault(); focus(visible[visible.length - 1]); break
      case 'ArrowRight':
        e.preventDefault()
        if (expanded === 'false') onCollapseKey(k, false)
        else if (expanded === 'true') focus(li.querySelector<HTMLElement>(':scope > ul > li[role="treeitem"]'))
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (expanded === 'true') onCollapseKey(k, true)
        else if (parentKey[k]) focus(treeRef.current?.querySelector<HTMLElement>(`li[data-key="${CSS.escape(parentKey[k]!)}"]`))
        break
      case 'Enter': case ' ': e.preventDefault(); ctx.onSelect(k); break
    }
  }

  return (
    <div
      id="tree"
      className={layout}
      ref={treeRef}
      style={layout === 'chart' ? { zoom } : undefined}
      onKeyDown={onKeyDown}
    >
      {roots.length ? (
        <ul role="tree" aria-label="Account map">
          {roots.map((r) => <TreeNode key={r} k={r} level={1} ctx={ctx} />)}
        </ul>
      ) : (
        <p className="empty-state">Nothing to show in this view yet.</p>
      )}
    </div>
  )
}
