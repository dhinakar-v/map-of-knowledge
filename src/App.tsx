import { useEffect, useState } from 'react'
import { api } from './api'
import { isPresenting, navHistory, parseHash, type Route } from './nav'
import Shell from './Shell'
import type { Tree } from './types'

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash))
  const [tree, setTree] = useState<Tree | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const on = () => { navHistory.count += 1; setRoute(parseHash(location.hash)) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const { view, account } = route
  // A preview tab for a client or prospect never shows the internal view, whatever the address says.
  const blocked = isPresenting() && view === 'internal'
  useEffect(() => {
    if (blocked) return
    let cancelled = false
    api.tree(view, account).then(
      (t) => { if (!cancelled) { setTree(t); setError('') } },
      (e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the page.') },
    )
    return () => { cancelled = true }
  }, [view, account, blocked])

  if (blocked) {
    return (
      <div className="empty-state" style={{ padding: 24 }} role="alert">
        <strong>This preview shows the client view or the case studies only.</strong>
      </div>
    )
  }
  if (error) {
    return (
      <div className="empty-state" style={{ padding: 24 }} role="alert">
        <strong>This page could not be loaded.</strong>
        <span>{error}</span>
      </div>
    )
  }
  // Keep showing the current view until the next one has loaded.
  if (!tree) return <p className="loading" role="status" style={{ padding: 24 }}>Loading…</p>
  if (tree.view !== view) return <p className="loading" role="status" style={{ padding: 24 }}>Loading…</p>
  return <Shell key={`${view}:${tree.account ?? ''}`} tree={tree} route={route} />
}
