import { Icon } from './Icon'
import NoteView from './NoteView'
import type { Tree } from './types'

export default function DetailsPanel({ tree, selected }: { tree: Tree; selected: string | null }) {
  if (!selected || !tree.nodes[selected]) {
    return (
      <div className="drawer-empty">
        <Icon name="cursor-click" />
        Pick a person, project or team to see more here.
      </div>
    )
  }
  return <NoteView key={selected} tree={tree} id={selected} mode="panel" />
}
