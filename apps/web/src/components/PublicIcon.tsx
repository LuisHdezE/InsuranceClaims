export type PublicIconName =
  | 'car'
  | 'document'
  | 'chat'
  | 'card'
  | 'help'
  | 'file'
  | 'users'
  | 'bolt'
  | 'shield'
  | 'headset'
  | 'camera'
  | 'search';

export function PublicIcon({ kind }: { kind: PublicIconName }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (kind === 'car') return <svg {...common}><path d="M5 17h14l-1.4-6.2a2 2 0 0 0-2-1.6H8.4a2 2 0 0 0-2 1.6L5 17Z"/><path d="M7.5 9.2 9 6.5h6l1.5 2.7"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>;
  if (kind === 'document') return <svg {...common}><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h4M10 12h5M10 16h5"/></svg>;
  if (kind === 'chat') return <svg {...common}><path d="M4 5h16v11H9l-5 4z"/></svg>;
  if (kind === 'card') return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/></svg>;
  if (kind === 'help') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 0 1 4.6 1c0 2-2.4 2.2-2.4 4M12 18h.01"/></svg>;
  if (kind === 'file') return <svg {...common}><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h4M10 12h5M10 16h5"/></svg>;
  if (kind === 'users') return <svg {...common}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 19a4.5 4.5 0 0 1 7 0"/></svg>;
  if (kind === 'bolt') return <svg {...common}><path d="m13 2-7 11h6l-1 9 7-12h-6z"/></svg>;
  if (kind === 'shield') return <svg {...common}><path d="M12 3 5 6v5c0 4.8 2.8 8 7 10 4.2-2 7-5.2 7-10V6z"/><path d="M12 7v10"/></svg>;
  if (kind === 'headset') return <svg {...common}><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="2"/><rect x="17" y="13" width="4" height="6" rx="2"/><path d="M17 19c0 1.1-.9 2-2 2h-2"/></svg>;
  if (kind === 'camera') return <svg {...common}><path d="M4 7h4l1.5-2h5L16 7h4v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>;
  return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
}
