import type { AskResponse, AskTurn, NoteDetail, SearchHit, Timeline, Tree, View } from './types'
import { searchIndex, type IndexRow } from './search'

/** Mirrors the dynamic backend's error shape so the pages' existing error handling still works. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Everything is static JSON under <base>/data/, built by export_static.py. BASE_URL is Vite's configured
// base (e.g. "/map-of-knowledge/"), so links work under a GitHub Pages sub-path.
const DATA = `${import.meta.env.BASE_URL}data`.replace(/\/\/+$/, '/')

async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path)
  } catch {
    throw new ApiError(0, 'Could not load the data file.')
  }
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? 'Not found' : res.statusText)
  return res.json() as Promise<T>
}

// ---------- account resolution (mirrors backend/auth.py) ----------

interface Meta {
  accounts: string[]
  defaultAccount: string | null
  colours: Record<string, string>
}
let metaCache: Promise<Meta> | null = null
const meta = () => (metaCache ??= getJson<Meta>(`${DATA}/meta.json`))

/** The on-disk folder for a (view, account). '' (internal/showcase) is stored as '_'. The client view with
 *  no account resolves to the single account, exactly like the old server did. */
async function folder(view: View, account: string | null): Promise<string> {
  if (view !== 'client') return `${view}/_`
  if (account) return `client/${encodeURIComponent(account)}`
  const m = await meta()
  if (m.defaultAccount) return `client/${encodeURIComponent(m.defaultAccount)}`
  throw new ApiError(422, 'the client view needs an account')
}

// ---------- client-side search ----------

const indexCache = new Map<string, Promise<IndexRow[]>>()
function loadIndex(view: View, account: string | null): Promise<IndexRow[]> {
  const keyP = folder(view, account)
  return keyP.then((f) => {
    if (!indexCache.has(f)) indexCache.set(f, getJson<IndexRow[]>(`${DATA}/${f}/search.json`))
    return indexCache.get(f)!
  })
}

// ---------- the surface the pages use (same signatures as the dynamic api) ----------

export const api = {
  async tree(view: View, account: string | null): Promise<Tree> {
    return getJson<Tree>(`${DATA}/${await folder(view, account)}/tree.json`)
  },

  async note(view: View, account: string | null, id: string): Promise<NoteDetail> {
    return getJson<NoteDetail>(`${DATA}/${await folder(view, account)}/notes/${encodeURIComponent(id)}.json`)
  },

  timeline(): Promise<Timeline> {
    return getJson<Timeline>(`${DATA}/internal/_/timeline.json`)
  },

  async search(view: View, account: string | null, q: string): Promise<SearchHit[]> {
    const rows = await loadIndex(view, account)
    return searchIndex(rows, q)
  },

  /** No LLM in a static build. Returned constant so the header hides the live Ask and shows the placeholder. */
  askStatus(_view: View, _account: string | null): Promise<{ available: boolean }> {
    return Promise.resolve({ available: false })
  },

  /** Ask is a static placeholder in this build; the panel never calls this. Present for type-compatibility. */
  ask(_view: View, _account: string | null, _question: string, _history: AskTurn[] = [],
      _signal?: AbortSignal): Promise<AskResponse> {
    return Promise.reject(new ApiError(503, 'Ask is not available in the static build.'))
  },

  /** Real documents are not shipped in the masked public build. Tell the user instead of navigating away. */
  async downloadDocument(_href: string, _view: View): Promise<void> {
    throw new ApiError(404, 'Documents are not available in this public demo.')
  },
}
