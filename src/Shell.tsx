import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import AskPanel from './AskPanel'
import DetailsPanel from './DetailsPanel'
import GlobalSearch from './GlobalSearch'
import { Icon } from './Icon'
import { useStored, useTheme } from './hooks'
import { isPresenting, NavContext, toHash, type Nav, type Route } from './nav'
import DocumentsPage from './pages/DocumentsPage'
import MapPage from './pages/MapPage'
import NotePage from './pages/NotePage'
import PeoplePage from './pages/PeoplePage'
import ProjectsPage from './pages/ProjectsPage'
import ShowcasePage from './pages/ShowcasePage'
import StartPage from './pages/StartPage'
import TimelinePage from './pages/TimelinePage'
import type { Tree, View } from './types'
import { brandName, fmtDate, prefersReducedMotion } from './util'

interface PageDef { id: string; label: string; icon: string }

// The pages of each view (SPEC 9.2). The first one is the landing page.
const PAGES: Record<View, PageDef[]> = {
  internal: [
    { id: 'start', label: 'Start here', icon: 'house' },
    { id: 'people', label: 'People', icon: 'users-four' },
    { id: 'projects', label: 'Projects', icon: 'briefcase' },
    { id: 'timeline', label: 'Timeline', icon: 'clock-counter-clockwise' },
    { id: 'map', label: 'Map', icon: 'tree-structure' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ],
  client: [
    { id: 'start', label: 'Overview', icon: 'house' },
    { id: 'people', label: 'People', icon: 'users-four' },
    { id: 'projects', label: 'Projects', icon: 'briefcase' },
    { id: 'map', label: 'Map', icon: 'tree-structure' },
  ],
  showcase: [{ id: 'cases', label: 'Case studies', icon: 'presentation-chart' }],
}

/** Scroll the page (not the window behind it, unless the page itself does not scroll, as on phones) so the
 * section with this id is at the top, and move focus to its heading. */
function showSection(id: string) {
  const el = document.getElementById(id)
  const scroller = document.getElementById('page')
  if (!el || !scroller) return
  const offset = el.getBoundingClientRect().top - 16
  if (/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller.scrollTop += offset - scroller.getBoundingClientRect().top
  else window.scrollBy(0, offset)
  const h = el.querySelector<HTMLElement>('h2')
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }) }
}

const SUBTITLE: Record<View, string> ={ internal: 'Account guide', client: 'Our work with J2W', showcase: 'Case studies' }

export default function Shell({ tree, route }: { tree: Tree; route: Route }) {
  const view = tree.view
  const N = tree.nodes
  const pages = PAGES[view]
  const page = route.page === 'note' && route.id && N[route.id] ? 'note'
    : pages.find((p) => p.id === route.page)?.id ?? pages[0].id
  const presenting = isPresenting()
  const brand = brandName(tree)
  const { dark, toggle } = useTheme()

  // ---------- navigation ----------
  const nav: Nav = useMemo(() => {
    const href = (pg: string, id = '', query = '') =>
      toHash({ view, account: route.account, page: pg === pages[0].id && !id && !query ? '' : pg, id, query })
    return { route, href, go: (pg, id, query) => { location.hash = href(pg, id, query) } }
  }, [view, route, pages])

  // ---------- details / ask drawer ----------
  const [selected, setSelected] = useState<string | null>(null)
  const [panel, setPanel] = useState<null | 'details' | 'ask'>(null)
  const [fromAsk, setFromAsk] = useState(false)
  const [wide, setWide] = useStored(view, 'wide', false)
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null)
  const [status, setStatus] = useState('')
  const opener = useRef<HTMLElement | null>(null)
  const drawerTitle = useRef<HTMLSpanElement>(null)

  // In the static build there is no live Ask (no backend/LLM). It is shown as a worked-example placeholder
  // instead, in the internal and client views (never the showcase, never a preview tab).
  const askAvailable = view !== 'showcase' && !presenting

  const openPanel = (p: 'details' | 'ask') => {
    if (!panel) opener.current = document.activeElement as HTMLElement | null
    setPanel(p)
    requestAnimationFrame(() => drawerTitle.current?.focus({ preventScroll: true }))
  }
  const closePanel = useCallback(() => {
    setPanel(null)
    opener.current?.focus?.({ preventScroll: true })
  }, [])

  const select = useCallback((id: string, opts: { reveal?: boolean; fromAsk?: boolean; open?: boolean } = {}) => {
    if (!N[id]) return
    setSelected(id)
    setFromAsk(!!opts.fromAsk)
    setStatus(`${N[id].title}, shown in details`)
    if (opts.reveal) setReveal({ id, n: Date.now() })
    if (opts.open !== false) {
      if (!panel) opener.current = document.activeElement as HTMLElement | null
      setPanel('details')
    }
  }, [N, panel])

  useEffect(() => {
    if (!panel) return
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [panel, closePanel])

  useEffect(() => { document.body.classList.toggle('wide', wide) }, [wide])

  // ---------- page title, focus on page change ----------
  const pageLabel = page === 'note' ? N[route.id]?.title : pages.find((p) => p.id === page)?.label
  useEffect(() => {
    document.title = `${pageLabel} · ${brand} ${SUBTITLE[view].toLowerCase()}`
  }, [pageLabel, brand, view])
  const firstRender = useRef(true)
  const at = new URLSearchParams(route.query).get('at')  // ?at=<section id>: open the page at that section
  useEffect(() => {
    const first = firstRender.current
    firstRender.current = false
    if (!first && window.innerWidth <= 760) setPanel(null)  // the phone drawer covers the page: close it on navigation
    if (at) { requestAnimationFrame(() => showSection(at)); return }
    if (first) return
    const h = document.querySelector<HTMLElement>('#page h1')
    h?.focus({ preventScroll: true })
    document.getElementById('page')?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [page, route.id, at])

  // Clicks anywhere: [data-go] selects a note (in the showcase it opens the case study page), and document links
  // are downloaded through the API (internal only) instead of opened as a plain link.
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    const go = target.closest<HTMLElement>('[data-go]')
    if (go?.dataset.go) {
      e.preventDefault()
      if (view === 'showcase') { nav.go('note', go.dataset.go); return }
      select(go.dataset.go, { reveal: true, fromAsk: !!go.closest('.ask') })
      return
    }
    const doc = target.closest<HTMLAnchorElement>('a[href^="documents/"]')
    if (doc) {
      e.preventDefault()
      api.downloadDocument(doc.getAttribute('href')!, view).catch((err) =>
        setStatus(err instanceof Error ? `Could not download: ${err.message}` : 'Could not download the document.'))
    }
  }

  const content = (() => {
    switch (page) {
      case 'note': return <NotePage tree={tree} id={route.id} />
      case 'people': return <PeoplePage tree={tree} selected={selected} />
      case 'projects': return <ProjectsPage tree={tree} />
      case 'timeline': return <TimelinePage tree={tree} />
      case 'map': return <MapPage tree={tree} selected={selected} reveal={reveal} onSelect={select} />
      case 'documents': return <DocumentsPage tree={tree} selected={selected} />
      case 'cases': return <ShowcasePage tree={tree} />
      default: return <StartPage tree={tree} />
    }
  })()
  const generated = fmtDate(tree.generated)

  return (
    <NavContext.Provider value={nav}>
      <a className="skip" href="#page">Skip to content</a>
      <header className={`appbar view-${view}`}>
        <div className="bar">
          <span className="brand">
            <Icon name="graph" />
            <span>{brand}</span>
            <span className="sub">· {SUBTITLE[view]}</span>
          </span>
          {view === 'internal' && <span className="viewbadge" title="Internal view: everything in the notes, for J2W only">Internal · J2W only</span>}
          <span className="spacer" />
          <div className="tools">
            {view !== 'showcase' && <GlobalSearch tree={tree} />}
            {askAvailable && (
              <button className="btn" aria-pressed={panel === 'ask'} onClick={() => (panel === 'ask' ? closePanel() : openPanel('ask'))}>
                <Icon name="chat-circle-dots" />Ask
              </button>
            )}
            {view === 'internal' && <PreviewMenu />}
            <button className="iconbtn" aria-label="Dark mode" aria-pressed={dark} title="Dark mode" onClick={toggle}>
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
          </div>
        </div>
        {pages.length > 1 && (
          <nav className="pages" aria-label="Pages">
            {pages.map((p) => (
              <a key={p.id} href={nav.href(p.id)} aria-current={page === p.id ? 'page' : undefined}>
                <Icon name={p.icon} />{p.label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main onClick={onClick}>
        <div id="page" tabIndex={-1} className={page === 'map' ? 'mappage' : 'textpage'}>
          {page === 'map' ? content : <div className="pagewrap">{content}</div>}
        </div>
        {view !== 'showcase' && (
          <aside id="details" className="drawer" hidden={!panel} aria-labelledby="drawer-title">
            <div className="drawer-head">
              {panel === 'details' && fromAsk && (
                <button className="btn ghost sm" onClick={() => setPanel('ask')}><Icon name="arrow-left" />Answer</button>
              )}
              <span className="title" id="drawer-title" tabIndex={-1} ref={drawerTitle}>
                {panel === 'ask' ? 'Ask about this account' : 'Quick view'}
              </span>
              {panel === 'details' && selected && (
                <a className="iconbtn sm" href={nav.href('note', selected)} title="Open as a page" aria-label="Open as a page">
                  <Icon name="arrow-square-out" />
                </a>
              )}
              <button className="iconbtn sm wide-toggle" aria-pressed={wide} aria-label="Wide panel" title="Wide panel" onClick={() => setWide(!wide)}>
                <Icon name="arrows-out-line-horizontal" />
              </button>
              <button className="iconbtn sm" aria-label="Close panel" title="Close (Esc)" onClick={closePanel}>
                <Icon name="x" />
              </button>
            </div>
            <div className="drawer-body">
              <div hidden={panel !== 'details'}><DetailsPanel tree={tree} selected={selected} /></div>
              {askAvailable && <div hidden={panel !== 'ask'}><AskPanel key={`${view}:${tree.account ?? ''}`} tree={tree} /></div>}
            </div>
          </aside>
        )}
      </main>
      <div className="sr-only" role="status">{status}</div>
      <footer>
        {view === 'internal' ? `Internal view · notes rebuilt ${generated}` : `Updated ${generated.replace(/\s+\d{1,2}:\d{2}$/, '')}`}
      </footer>
    </NavContext.Provider>
  )
}

/** Internal only: open what a client or a prospect would see, in a new tab without the internal controls. */
function PreviewMenu() {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])
  return (
    <details className="menu" ref={ref}>
      <summary className="btn"><Icon name="eye" />Preview as<Icon name="caret-down" /></summary>
      <div className="pop" role="menu">
        <a className="item" role="menuitem" href="?present=1#client" target="_blank" rel="noopener">
          <b><Icon name="buildings" />Client view</b>
          <small>What the client sees. Opens in a new tab.</small>
        </a>
        <a className="item" role="menuitem" href="?present=1#showcase" target="_blank" rel="noopener">
          <b><Icon name="presentation-chart" />Showcase</b>
          <small>Anonymised case studies for prospects.</small>
        </a>
      </div>
    </details>
  )
}
