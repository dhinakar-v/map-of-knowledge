import { Icon } from '../Icon'
import NoteView from '../NoteView'
import { navHistory, useNav } from '../nav'
import type { Tree } from '../types'

/** One item as a full page, so it can be read comfortably, linked and bookmarked. */
export default function NotePage({ tree, id }: { tree: Tree; id: string }) {
  const nav = useNav()
  // Back inside the app when we came from a page of it; opened from a link, go to the start page instead.
  const back = () => (navHistory.count > 0 ? history.back() : nav.go(''))
  return (
    <>
      <button type="button" className="backlink" onClick={back}>
        <Icon name="arrow-left" />{navHistory.count > 0 ? 'Back' : 'Home'}
      </button>
      <NoteView tree={tree} id={id} mode="page" />
    </>
  )
}
