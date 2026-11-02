import icons from './assets/phosphor-icons.json'

// Phosphor Icons (regular, MIT): the inner SVG markup is bundled with the app, not user input.
const ICONS = icons as Record<string, string>

export const typeIcon: Record<string, string> = {
  account: 'buildings', department: 'buildings', project: 'briefcase', stakeholder: 'user-circle',
  team: 'users-three', person: 'user', outcome: 'target', lesson: 'lightbulb', proposal: 'handshake',
  document: 'file-text',
}

export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg
      className="ic"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      style={size ? { fontSize: size } : undefined}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  )
}
