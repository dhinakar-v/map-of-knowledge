import type { AskResponse, Tree } from './types'

/** Earlier turns sent with a follow-up question (the server uses no more than this either). */
export const HISTORY_TURNS = 4

export interface Turn {
  id: number
  question: string
  status: 'pending' | 'done' | 'error'
  result?: AskResponse
  error?: string
}

/** The conversation lasts for the browser session, per view and account. */
export const storageKey = (tree: Tree) => `maptree:${tree.view}:${tree.account ?? ''}:ask`

export function loadTurns(key: string): Turn[] {
  try {
    const turns: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    return Array.isArray(turns) ? (turns as Turn[]).filter((t) => t.status === 'done' && t.result) : []
  } catch {
    return []
  }
}

export function saveTurns(key: string, turns: Turn[]) {
  try {
    const done = turns.filter((t) => t.status === 'done')
    if (done.length) sessionStorage.setItem(key, JSON.stringify(done))
    else sessionStorage.removeItem(key)
  } catch {
    /* storage blocked: the conversation lasts until the page reloads */
  }
}
