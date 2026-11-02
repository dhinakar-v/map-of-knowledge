import type { CSSProperties, ReactNode } from 'react'
import { Icon, typeIcon } from '../Icon'
import { useNav } from '../nav'
import type { Tree } from '../types'
import { statusTone, titleCase, typeColour, typeLabel } from '../util'

export function TypeIcon({ type, title }: { type: string; title?: boolean }) {
  return (
    <span className="typeicon" style={{ '--tc': typeColour(type), display: 'inline-flex' } as CSSProperties}
      title={title ? typeLabel(type) : undefined}>
      <Icon name={typeIcon[type] ?? 'file-text'} />
    </span>
  )
}

/** An item's name: opens its details (a button), or its own page with `page`. */
export function EntityLink({ tree, id, children, page, icon = true }:
  { tree: Tree; id: string; children?: ReactNode; page?: boolean; icon?: boolean }) {
  const nav = useNav()
  const n = tree.nodes[id]
  if (!n) return <>{children}</>
  const inner = <>{icon && <TypeIcon type={n.type} />}<span className="t">{children ?? n.title}</span></>
  if (page) return <a className="entity" href={nav.href('note', id)}>{inner}</a>
  return <button type="button" className="entity" data-go={id}>{inner}</button>
}

/** Status as a toned badge, title-cased: Active, Planned, Completed... */
export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  if (!status && !children) return null
  return <span className={`badge ${statusTone(status ?? '')}`}>{children ?? titleCase(status ?? '')}</span>
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="pagehead">
      <h1 tabIndex={-1}>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Block({ title, count, children, id }: { title: ReactNode; count?: number; children: ReactNode; id?: string }) {
  return (
    <section className="block" id={id}>
      <h2>{title}{count !== undefined && <span className="count">{count}</span>}</h2>
      {children}
    </section>
  )
}
