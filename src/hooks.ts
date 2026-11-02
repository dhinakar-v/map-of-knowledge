import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { NoteDetail, Tree, View } from './types'

/** State kept in localStorage as maptree:<view>:<key>; works without storage too. */
export function useStored<T>(view: View, key: string, initial: T): [T, (v: T) => void] {
  const full = `maptree:${view}:${key}`
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(full)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      try {
        localStorage.setItem(full, JSON.stringify(v))
      } catch {
        /* ignore */
      }
    },
    [full],
  )
  return [value, set]
}

/** Light/dark: follows the system until the toggle is used, then the choice is remembered. */
export function useTheme() {
  const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches
  const current = () => {
    const t = document.documentElement.dataset.theme
    return t ? t === 'dark' : systemDark()
  }
  const [dark, setDark] = useState(current)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(current())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const toggle = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('maptree:theme', next)
    } catch {
      /* ignore */
    }
    setDark(!dark)
  }
  return { dark, toggle }
}

// Note bodies, fetched once per view and account and shared by every panel and page.
const noteCache = new Map<string, NoteDetail>()

export function useNote(tree: Tree, id: string | null) {
  const key = `${tree.view}:${tree.account ?? ''}:${id}`
  const [state, setState] = useState<{ key: string; note: NoteDetail | null; error: string }>(
    () => ({ key, note: noteCache.get(key) ?? null, error: '' }))
  useEffect(() => {
    if (!id) return
    const hit = noteCache.get(key)
    if (hit) { setState({ key, note: hit, error: '' }); return }
    let cancelled = false
    setState({ key, note: null, error: '' })
    api.note(tree.view, tree.account, id).then(
      (n) => { noteCache.set(key, n); if (!cancelled) setState({ key, note: n, error: '' }) },
      (e) => { if (!cancelled) setState({ key, note: null, error: e instanceof Error ? e.message : 'Could not load the note.' }) },
    )
    return () => { cancelled = true }
  }, [key, id, tree.view, tree.account])
  return state.key === key ? state : { key, note: null, error: '' }
}
