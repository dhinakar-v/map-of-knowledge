import { Icon } from './Icon'
import { TypeIcon } from './pages/common'
import type { Tree } from './types'

/**
 * Static-build Ask panel. The live LLM feature needs a secret API key and a running backend, so it cannot
 * ship to public GitHub Pages. This renders ONE worked example (question + canned answer with sample
 * citations) so visitors can see what Ask does, with a clear note that it is a demo. No network call.
 *
 * The example answer is already masked (it talks about the demo's fake names), and the citation ids point at
 * notes that exist in the internal view of the built data.
 */

const EXAMPLE_QUESTION = 'Which J2W DevOps engineers are on the floor at GE working on an active project?'

interface Source { id: string; title: string; type: string }

// A canned answer in the same shape the live server returned (answer_html with numbered [n] markers that
// match the Sources list). Written against the masked demo data.
const EXAMPLE_ANSWER_HTML =
  '<p>Three Northwind engineers are working on site in DevOps roles on active programmes:</p>' +
  '<ul>' +
  '<li>Sage Calloway owns the DSL library and DevOps on the Nova Programme ' +
  '<a data-go="sage-calloway" href="#" title="Sage Calloway">1</a>.</li>' +
  '<li>Kendall Harmon also owns DSL and DevOps work on the same programme ' +
  '<a data-go="kendall-harmon" href="#" title="Kendall Harmon">2</a>.</li>' +
  '<li>Riley Carter is a DevOps Engineer on the delivery team ' +
  '<a data-go="riley-carter" href="#" title="Riley Carter">3</a>.</li>' +
  '</ul>' +
  '<p>All three are assigned to a programme with status <em>active</em> under the Nova Programme ' +
  '<a data-go="nova-programme" href="#" title="Nova Programme">4</a>.</p>'

const EXAMPLE_SOURCES: Source[] = [
  { id: 'sage-calloway', title: 'Sage Calloway', type: 'person' },
  { id: 'kendall-harmon', title: 'Kendall Harmon', type: 'person' },
  { id: 'riley-carter', title: 'Riley Carter', type: 'person' },
  { id: 'nova-programme', title: 'Nova Programme', type: 'project' },
]

export default function AskPanel({ tree: _tree }: { tree: Tree }) {
  return (
    <div className="ask">
      <div className="callout" role="note">
        <Icon name="info" />
        <span className="msg">
          This is a static demo. The live “Ask” answers questions from the notes with an AI model — it needs a
          backend and isn’t available on this public site. Here is one worked example of what it does.
        </span>
      </div>

      <ol className="thread" aria-label="Example conversation">
        <li className="turn">
          <p className="q"><span className="sr-only">You asked: </span>{EXAMPLE_QUESTION}</p>
          {/* answer_html is static, author-controlled markup; [[links]] resolve to notes in this view */}
          <div className="note answer" dangerouslySetInnerHTML={{ __html: EXAMPLE_ANSWER_HTML }} />
          <section className="sources">
            <h3>Sources</h3>
            <ol className="list">
              {EXAMPLE_SOURCES.map((s, i) => (
                <li key={s.id}>
                  <span className="num" aria-hidden="true">{i + 1}</span>
                  <button type="button" className="entity" data-go={s.id}>
                    <TypeIcon type={s.type} /><span className="t">{s.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </li>
      </ol>

      <p className="disclaimer"><Icon name="info" />Example answer. On the live app, answers come from the notes in this view — check the sources.</p>
    </div>
  )
}
