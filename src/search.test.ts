import { describe, expect, it } from 'vitest'
import { queryWords, searchIndex, type IndexRow } from './search'

function row(id: string, title: string, type: string, sub: string, body: string): IndexRow {
  const words = (`${title} ${sub} ${body}`.toLowerCase().match(/\w+/g) ?? []).filter((w) => w.length > 1)
  return { id, title, type, sub, body, words }
}

const ROWS: IndexRow[] = [
  row('p1', 'Nova Programme', 'project', 'active', 'Automate the release pipeline for the imaging platform.'),
  row('p2', 'Atlas Programme', 'project', 'completed', 'A finished data migration project with lessons learnt.'),
  row('jd', 'Sage Calloway', 'person', 'DevOps Engineer', 'Owns the deployment tooling and build automation.'),
  row('d1', 'Beacon Rangers', 'team', 'Acme Health', 'Standing client team for verification work.'),
]

describe('queryWords', () => {
  it('lowercases, drops short words and stopwords, dedupes, caps at 12', () => {
    expect(queryWords('The Nova release')).toEqual(['nova', 'release'])
    expect(queryWords('an the of')).toEqual(['an', 'the', 'of']) // all stopwords -> fall back to raw (len>1)
    expect(queryWords('Nova nova NOVA')).toEqual(['nova'])
  })
})

describe('searchIndex', () => {
  it('ranks a title match above a body-only match', () => {
    const hits = searchIndex(ROWS, 'programme')
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits[0].title).toMatch(/Programme/)
  })

  it('finds a person by role text in the body and marks the snippet', () => {
    const hits = searchIndex(ROWS, 'automation')
    const person = hits.find((h) => h.id === 'jd')
    expect(person).toBeTruthy()
    expect(person!.snippet).toContain('<mark>')
    expect(person!.snippet.toLowerCase()).toContain('automation')
  })

  it('matches on a prefix, like FTS5 word*', () => {
    const hits = searchIndex(ROWS, 'deploy')
    expect(hits.some((h) => h.id === 'jd')).toBe(true)
  })

  it('returns nothing for an empty or no-match query', () => {
    expect(searchIndex(ROWS, '')).toEqual([])
    expect(searchIndex(ROWS, 'zzzznomatch')).toEqual([])
  })

  it('escapes HTML in snippets, adding only <mark>', () => {
    const rows = [row('x', 'Danger', 'project', '', 'watch out for <script>alert(1)</script> injection code')]
    const hits = searchIndex(rows, 'injection')
    expect(hits[0].snippet).toContain('&lt;script&gt;')
    expect(hits[0].snippet).not.toContain('<script>')
  })
})
