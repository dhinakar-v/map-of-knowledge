import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as apiModule from './api'
import AskPanel from './AskPanel'
import type { MapNode, Tree, View } from './types'

function node(id: string, title: string, type: string, status: string): MapNode {
  return { id, title, type, sub: '', org: '', status, placeholder: false, body_text: '', summary: '', props: [],
    parent: null, children: [], neighbours: [] }
}

function makeTree(view: View = 'internal'): Tree {
  return {
    view, account: view === 'client' ? 'acme-health' : null, title: 'Map', colours: {}, generated: '',
    layout: { roots: [], slots: {} },
    nodes: { p1: node('p1', 'Nova Programme', 'project', 'active') },
  }
}

afterEach(cleanup)

describe('AskPanel (static placeholder)', () => {
  it('shows the demo notice, the worked example question and a canned answer', () => {
    render(<AskPanel tree={makeTree()} />)
    expect(screen.getByRole('note').textContent).toMatch(/static demo/i)
    expect(screen.getByText(/Which J2W DevOps engineers are on the floor/i)).toBeTruthy()
    const answer = document.querySelector('.answer')!
    expect(answer.innerHTML).toContain('data-go="sage-calloway"')
  })

  it('lists numbered sources that are clickable entities', () => {
    render(<AskPanel tree={makeTree()} />)
    const sources = screen.getByRole('heading', { name: 'Sources' }).closest('section')!
    const items = within(sources).getAllByRole('listitem').map((li) => li.textContent)
    expect(items[0]).toContain('Sage Calloway')
    expect(within(sources).getAllByRole('button').length).toBeGreaterThanOrEqual(4)
  })

  it('makes no network call (no ask/fetch) when rendered', () => {
    const askSpy = vi.spyOn(apiModule.api, 'ask')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    render(<AskPanel tree={makeTree('client')} />)
    expect(askSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    askSpy.mockRestore()
    fetchSpy.mockRestore()
  })
})
