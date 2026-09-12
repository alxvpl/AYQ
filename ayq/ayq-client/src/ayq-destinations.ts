// The rail's destinations, in the order 04 A20 fixes.
//
// Three groups, separated by hairlines, ordered by how often a destination is
// opened rather than by the path the data takes (A2). Settings sits at the
// foot, apart. Import is also reachable from Today, beside the statement
// coverage line, where it is looked for.
//
// This module holds the order and nothing else: no labels, because those are
// the catalogue's (A24), and no icons, because those are the rail's.

import type { AyqStringKey } from './ayq-strings.ts';

export type AyqDestination =
  | 'today'
  | 'accounts'
  | 'register'
  | 'review'
  | 'upcoming'
  | 'plan'
  | 'reports'
  | 'import'
  | 'settings';

export type AyqDestinationGroup = {
  key: AyqStringKey;
  destinations: readonly AyqDestination[];
};

/** The three groups of A20, in order. Settings is not one of them. */
export const AYQ_RAIL_GROUPS: readonly AyqDestinationGroup[] = [
  {
    key: 'destination.group.whereYouStand',
    destinations: ['today', 'accounts', 'register'],
  },
  {
    key: 'destination.group.whatNeedsDeciding',
    destinations: ['review', 'upcoming', 'plan'],
  },
  { key: 'destination.group.seldom', destinations: ['reports', 'import'] },
];

/** At the foot, apart (A20). */
export const AYQ_RAIL_FOOT: AyqDestination = 'settings';

/** Where the application opens (A21). */
export const AYQ_FIRST_DESTINATION: AyqDestination = 'today';

export const AYQ_DESTINATIONS: readonly AyqDestination[] = [
  ...AYQ_RAIL_GROUPS.flatMap(group => group.destinations),
  AYQ_RAIL_FOOT,
];

export const AYQ_DESTINATION_LABEL: Record<AyqDestination, AyqStringKey> = {
  today: 'destination.today',
  accounts: 'destination.accounts',
  register: 'destination.register',
  review: 'destination.review',
  upcoming: 'destination.upcoming',
  plan: 'destination.plan',
  reports: 'destination.reports',
  import: 'destination.import',
  settings: 'destination.settings',
};

/**
 * What the screen is for, said once under its name.
 *
 * Not every destination has one. Reports says what it is in the only sentence
 * it has to say, and Settings is a set of tabs whose names are the whole of
 * the explanation; a line of prose over either would be a line of prose put
 * there to fill a space.
 */
export const AYQ_DESTINATION_BLURB: Partial<
  Record<AyqDestination, AyqStringKey>
> = {
  today: 'screen.today.blurb',
  accounts: 'screen.accounts.blurb',
  register: 'screen.register.blurb',
  review: 'screen.review.blurb',
  upcoming: 'screen.upcoming.blurb',
  plan: 'screen.plan.blurb',
  import: 'screen.import.blurb',
};
