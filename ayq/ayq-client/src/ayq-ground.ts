// Which ground is in force, and what it takes to change it.
//
// 04 A23: light, dark and "follow the system" are all supported and the
// setting is the owner's. Two rules follow, and both are here rather than in a
// component: `system` is not a third set of values but a question put to the
// operating system, and a change applies without a restart.

import type { AyqGround, AyqGroundResolved } from './ayq-tokens.ts';

/** What `system` means at this moment. */
export function ayqResolveGround(
  ground: AyqGround,
  systemPrefersDark: boolean,
): AyqGroundResolved {
  if (ground === 'light') return 'light';
  if (ground === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** What the operating system is asking for, right now. */
export function ayqSystemPrefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches === true;
}

/**
 * Watches the operating system's own setting.
 *
 * Returns the way to stop watching. Nothing is polled: a person who switches
 * Windows to dark at dusk sees AYQ follow, without restarting it.
 */
export function ayqWatchSystemGround(
  onChange: (prefersDark: boolean) => void,
): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
