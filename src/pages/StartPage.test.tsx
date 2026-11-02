import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavContext, type Nav } from '../nav'
import type { Assignment, MapNode, Tree, View } from '../types'
import { daysAgo, localDate, recordVisit } from '../visits'
import StartPage from './StartPage'

function node(id: string, title: string, type: string, extra: Partial<MapNode> = {}): MapNode {
  return { id, title, type, sub: '', org: '', status: '', placeholder: false, body_text: '', summary: '', props: [],
    parent: null, children: [], neighbours: [], ...extra }
}

const on = (project: string, role: string): Assignment =>
  ({ in: project, in_title: project, team: null, team_title: '', role, start: '2026-04', end: '', active: true })

const UPDATED = '2026-10-29'

function makeTree(view: View = 'internal', extra: Record<string, MapNode> = {}, industry = 'Healthcare technology'): Tree {
  const nodes: Record<string, MapNode> = {
    acme: node('acme', 'Acme', 'account', { summary: 'Acme makes things.', props: [['industry', industry]], updated: UPDATED }),
    ops: node('ops', 'Operations', 'department', { parent: 'acme', updated: UPDATED }),
    p1: node('p1', 'Release Automation', 'project', { status: 'active', parent: 'ops', summary: 'Automate releases.', updated: UPDATED }),
    p2: node('p2', 'Old Migration', 'project', { status: 'completed', parent: 'ops', updated: '2026-09-01' }),
    jane: node('jane', 'Jane Doe', 'person', { assignments: [on('p1', 'Engagement Lead')], updated: UPDATED }),
    sam: node('sam', 'Sam Client', 'stakeholder', { assignments: [on('p1', 'Project sponsor')], placeholder: true, updated: UPDATED }),
    ...extra,
  }
  return { view, account: view === 'client' ? 'acme' : null, title: 'Acme map', colours: {}, generated: '',
    layout: { roots: ['s-acme'], slots: { 's-acme': { id: 'acme', children: [], past: false } } }, nodes }
}

const nav: Nav = {
  route: { view: 'internal', account: null, page: '', id: '', query: '' },
  href: (page, id = '', query = '') => `#internal/${page}${id ? `/${id}` : ''}${query ? `?${query}` : ''}`,
  go: () => {},
}

function renderPage(tree = makeTree()) {
  return render(<NavContext.Provider value={nav}><StartPage tree={tree} /></NavContext.Provider>)
}

const STEPS_KEY = 'maptree:internal:steps:acme'
const toggleFor = (title: RegExp) => screen.getByRole('button', { name: title })
const progress = () => screen.getByRole('progressbar', { name: 'First week progress' })

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Start here: first week steps', () => {
  it('marks a step done with a toggle button, saved by step id per account', async () => {
    const user = userEvent.setup()
    renderPage()
    const toggle = toggleFor(/^Mark done: The account$/)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.textContent).toBe('Mark done')
    expect(screen.queryByRole('checkbox')).toBeNull()
    await user.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.textContent).toBe('Done')
    expect(progress().getAttribute('aria-valuenow')).toBe('1')
    expect(screen.getByText('1 of 7 done')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(STEPS_KEY)!)).toEqual(['account'])
    await user.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(JSON.parse(localStorage.getItem(STEPS_KEY)!)).toEqual([])
  })

  it('ignores saved ids of steps that no longer exist, and the old index-based progress', () => {
    localStorage.setItem(STEPS_KEY, JSON.stringify(['team', 'gone-step']))
    localStorage.setItem('maptree:internal:steps', JSON.stringify([0, 1, 2]))
    renderPage()
    expect(progress().getAttribute('aria-valuenow')).toBe('1')
    expect(toggleFor(/^Mark done: Our team/).getAttribute('aria-pressed')).toBe('true')
    expect(toggleFor(/^Mark done: The account$/).getAttribute('aria-pressed')).toBe('false')
  })

  it('collapses a finished step to its title, and Show opens it again', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole('link', { name: 'Read the account page' })).toBeTruthy()
    await user.click(toggleFor(/^Mark done: The account$/))
    expect(screen.queryByRole('link', { name: 'Read the account page' })).toBeNull()
    const show = screen.getByRole('button', { name: 'Show' })
    expect(show.getAttribute('aria-expanded')).toBe('false')
    await user.click(show)
    expect(screen.getByRole('link', { name: 'Read the account page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('says when the week is done, and Start over clears it', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull()
    for (const t of screen.getAllByRole('button', { name: /^Mark done: / })) await user.click(t)
    expect(screen.getByText(/First week done/)).toBeTruthy()
    expect(progress().getAttribute('aria-valuenow')).toBe('7')
    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(progress().getAttribute('aria-valuenow')).toBe('0')
    expect(screen.queryByText(/First week done/)).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Mark done: / }).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('links each step to one clear next action', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Read the account page' }).getAttribute('href')).toBe('#internal/note/acme')
    expect(screen.getByRole('link', { name: 'All J2W people' }).getAttribute('href')).toBe('#internal/people?side=ours')
    expect(screen.getByRole('link', { name: 'Proposals' }).getAttribute('href')).toBe('#internal/documents?at=proposals')
  })

  it('shows "Not recorded yet" for an empty step and hides a TODO industry', () => {
    renderPage(makeTree('internal', {}, 'TODO: industry'))
    expect(screen.queryByText(/TODO: industry/)).toBeNull()
    expect(screen.getByText(/No proposals recorded yet/)).toBeTruthy()
  })

  it('shows the stats as links, with past projects opening the Past section', () => {
    renderPage()
    const tiles = screen.getByRole('navigation', { name: 'The account at a glance' })
    const past = within(tiles).getByRole('link', { name: /1 past project/ })
    expect(past.getAttribute('href')).toBe('#internal/projects?at=past')
    expect(within(tiles).getByRole('link', { name: /1 current project$/ })).toBeTruthy()
    expect(within(tiles).getByRole('link', { name: /0 proposals/ })).toBeTruthy()
  })
})

describe('Start here: what changed', () => {
  it('recordVisit keeps the previous day across several visits on one day and moves on a new day', () => {
    expect(recordVisit('2026-10-20')).toBe('')  // first visit
    expect(recordVisit('2026-10-20')).toBe('')  // same day again
    expect(recordVisit('2026-10-25')).toBe('2026-10-20')
    expect(recordVisit('2026-10-25')).toBe('2026-10-20')  // the old bug: this became 2026-10-25
    expect(recordVisit('2026-10-30')).toBe('2026-10-25')
  })

  it('carries over the visit date saved by the earlier version', () => {
    localStorage.setItem('maptree:internal:lastVisit', '2026-10-01')
    expect(recordVisit('2026-10-30')).toBe('2026-10-01')
  })

  it('uses local dates', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(daysAgo(30, new Date(2026, 9, 30, 12))).toBe('2026-09-30')
  })

  it('lists notes changed since the previous visit, grouped by day', () => {
    localStorage.setItem('maptree:internal:visits', JSON.stringify({ prev: '', last: '2026-10-20' }))
    renderPage()
    const card = screen.getByRole('region', { name: 'What changed' })
    expect((within(card).getByLabelText('Since') as HTMLInputElement).value).toBe('2026-10-20')
    expect(within(card).getByRole('heading', { name: '29 Oct 2026' })).toBeTruthy()
    expect(within(card).getByText(/5 notes updated since 20 Oct 2026/)).toBeTruthy()
    expect(within(card).queryByText('Old Migration')).toBeNull()
  })

  it('a chosen Since date changes the list', () => {
    localStorage.setItem('maptree:internal:visits', JSON.stringify({ prev: '', last: '2026-10-20' }))
    renderPage()
    const card = screen.getByRole('region', { name: 'What changed' })
    fireEvent.change(within(card).getByLabelText('Since'), { target: { value: '2026-08-01' } })
    expect(within(card).getByRole('heading', { name: '1 Sep 2026' })).toBeTruthy()
    expect(within(card).getByText('Old Migration')).toBeTruthy()
    fireEvent.change(within(card).getByLabelText('Since'), { target: { value: '2026-10-30' } })
    expect(within(card).getByText(/Nothing has changed since 30 Oct 2026/)).toBeTruthy()
  })

  it('on a first visit looks back 30 days', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 30, 12))
    renderPage()
    const card = screen.getByRole('region', { name: 'What changed' })
    expect((within(card).getByLabelText('Since') as HTMLInputElement).value).toBe('2026-09-30')
  })
})

describe('Start here: gaps', () => {
  it('counts one item in the singular', () => {
    renderPage()
    const card = screen.getByRole('region', { name: 'Facts not recorded yet' })
    expect(card.textContent).toContain("1 item still marked TODO. Don't rely on it yet.")
    expect(within(card).getByText('Sam Client')).toBeTruthy()
  })

  it('counts several items in the plural, current-project ones first', () => {
    renderPage(makeTree('internal', {
      zed: node('zed', 'Aaron Elsewhere', 'stakeholder', { placeholder: true }),
    }))
    const card = screen.getByRole('region', { name: 'Facts not recorded yet' })
    expect(card.textContent).toContain('2 items still marked TODO.')
    const names = within(card).getAllByRole('listitem').map((li) => li.textContent)
    expect(names).toEqual(['Sam Client', 'Aaron Elsewhere'])
  })
})

describe('Client overview', () => {
  it('shows a dash for a missing goal', () => {
    renderPage(makeTree('client', { p1: node('p1', 'Release Automation', 'project', { status: 'active', parent: 'ops' }) }))
    const row = screen.getByRole('row', { name: /Release Automation/ })
    expect(within(row).getByText('—')).toBeTruthy()
  })

  it('shows a short message when there are no current projects', () => {
    renderPage(makeTree('client', { p1: node('p1', 'Release Automation', 'project', { status: 'cancelled', parent: 'ops' }) }))
    expect(screen.getByText('No current projects to show yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('has no first-week steps', () => {
    renderPage(makeTree('client'))
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
  })
})
