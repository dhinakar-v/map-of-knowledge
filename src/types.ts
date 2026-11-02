export type View = 'internal' | 'client' | 'showcase'

export interface Assignment {
  in: string
  in_title: string
  team: string | null
  team_title: string
  role: string
  start: string
  end: string
  active: boolean
}

export interface MapNode {
  id: string
  title: string
  type: string
  sub: string
  org: string
  status: string
  placeholder: boolean
  body_text: string
  summary: string
  props: [string, string][]
  parent: string | null
  children: string[]
  neighbours: string[]
  /** people only */
  assignments?: Assignment[]
  /** internal view only */
  updated?: string
  led_to?: string | null
  file?: string
}

export interface NoteDetail extends MapNode {
  body_html: string
}

/** One place in the display tree. A note (a person, a standing team) can sit in several slots. */
export interface Slot {
  id: string
  children: string[]
  past: boolean
  /** people: their role in this place */
  role?: string
}

export interface Tree {
  view: View
  account: string | null
  title: string
  colours: Record<string, string>
  generated: string
  layout: { roots: string[]; slots: Record<string, Slot> }
  nodes: Record<string, MapNode>
}

export interface TimelineEvent {
  month: string
  kind: string
  id: string
  text: string
  /** people events: where, joins/leaves, who, as what */
  place?: string
  verb?: 'joins' | 'leaves'
  person?: string
  role?: string
}

export interface SearchHit {
  id: string
  title: string
  type: string
  sub: string
  snippet: string
}

export interface Timeline {
  events: TimelineEvent[]
  undated: TimelineEvent[]
}

export interface AskSource {
  id: string
  title: string
  type: string
}

export interface AskResponse {
  answer_html: string
  /** The answer as text, sent back as history with a follow-up question */
  answer_md: string
  /** Numbered as the citation markers in answer_html when cited */
  sources: AskSource[]
  cited: boolean
}

/** An earlier question and answer, sent with a follow-up (the server keeps no conversation) */
export interface AskTurn {
  question: string
  answer: string
  sources: string[]
}
