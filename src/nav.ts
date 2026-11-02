import { createContext, useContext } from 'react'
import type { View } from './types'

/** The address says the view, the page, an optional note id and options:
 *  #<view>[:<account>]/<page>[/<id>][?<query>]. #external still opens the client view. */
export interface Route {
  view: View
  account: string | null
  page: string
  id: string
  query: string
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [path, query = ''] = raw.split('?')
  const parts = path.split('/').map((p) => decodeURIComponent(p))
  const [v, account = null] = (parts[0] ?? '').split(':')
  const view: View = v === 'client' || v === 'external' ? 'client' : v === 'showcase' ? 'showcase' : 'internal'
  return { view, account: view === 'client' ? account : null, page: parts[1] ?? '', id: parts.slice(2).join('/'), query }
}

export function toHash(r: Route) {
  let h = `#${r.view}${r.account ? `:${encodeURIComponent(r.account)}` : ''}`
  if (r.page) h += `/${r.page}`
  if (r.id) h += `/${encodeURIComponent(r.id)}`
  if (r.query) h += `?${r.query}`
  return h
}

export interface Nav {
  route: Route
  /** address of a page (or a note page) in the current view */
  href: (page: string, id?: string, query?: string) => string
  go: (page: string, id?: string, query?: string) => void
}

export const NavContext = createContext<Nav | null>(null)

export function useNav(): Nav {
  const nav = useContext(NavContext)
  if (!nav) throw new Error('useNav outside NavContext')
  return nav
}

/** Hash changes since the app loaded: Back may only go back inside the app. */
export const navHistory = { count: 0 }

/** Presenting to a client or prospect: opened from the internal view's "Preview as" menu with ?present=1. */
export const isPresenting = () => new URLSearchParams(location.search).get('present') === '1'
