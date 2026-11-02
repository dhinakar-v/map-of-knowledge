import { useEffect, useId, useRef, useState } from 'react'
import { api } from './api'
import { Icon, typeIcon } from './Icon'
import { useNav } from './nav'
import type { SearchHit, Tree } from './types'
import { titleCase, typeColour, typeLabel } from './util'

/** Header search across everything in the current view. Enter or a click opens the item's page. */
export default function GlobalSearch({ tree }: { tree: Tree }) {
  const nav = useNav()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  // "/" or Ctrl+K focuses the search
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    let cancelled = false
    const timer = setTimeout(() => {
      api.search(tree.view, tree.account, t).then(
        (h) => { if (!cancelled) { setHits(h); setActive(0) } },
        () => { if (!cancelled) setHits([]) },
      )
    }, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [q, tree.view, tree.account])

  const shown = q.trim().length >= 2 ? hits : null
  const openHit = (h: SearchHit) => {
    setOpen(false)
    setQ('')
    nav.go('note', h.id)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); return }
    if (!shown?.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((active + 1) % shown.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + shown.length) % shown.length) }
    else if (e.key === 'Enter') { e.preventDefault(); openHit(shown[active]) }
  }
  const expanded = open && shown !== null

  return (
    <div className="gsearch">
      <label className="searchbox">
        <Icon name="magnifying-glass" />
        <span className="sr-only">Search this account</span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && shown?.length ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          placeholder="Search people, projects…  /"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
        />
      </label>
      <span className="sr-only" role="status">{shown ? `${shown.length} results` : ''}</span>
      {expanded && (
        <ul className="results" id={listId} role="listbox" aria-label="Search results">
          {shown.length === 0 && <li className="none" role="option" aria-selected="false">No matches for “{q.trim()}”</li>}
          {shown.map((h, i) => (
            <li key={h.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); openHit(h) }} onMouseEnter={() => setActive(i)}>
              <span className="typeicon" style={{ '--tc': typeColour(h.type) } as React.CSSProperties}>
                <Icon name={typeIcon[h.type] ?? 'file-text'} />
              </span>
              <span>
                <b>{h.title}</b>
                <small>{typeLabel(h.type)}{h.sub ? ` · ${/^[a-z-]+$/.test(h.sub) ? titleCase(h.sub) : h.sub}` : ''}</small>
                {/* the snippet is escaped by the server; only <mark> is added */}
                {h.snippet && <small dangerouslySetInnerHTML={{ __html: h.snippet }} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
