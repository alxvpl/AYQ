// AYQ Analyses — the destinations the rail offers.
//
// Six analytical destinations in the accepted order (AYQ_ANALYSES_PROJECT_WORK_
// INSTRUCTIONS §11; r002 §3.1), and, separately, Settings as utility
// navigation at the rail footer — never a seventh analytical destination.
// An analytical destination not in this version is a navigable placeholder
// whose body answers with exactly one catalogue sentence; a blank body is a
// defect (r002 §3.1).

import type { StringKey } from './strings.js';

export type AnalyticalDestination = 'overview' | 'explore' | 'fixedCosts' | 'projection' | 'scenarios' | 'savedAnalyses';

export type Destination = AnalyticalDestination | 'settings';

export const ANALYTICAL_DESTINATIONS: readonly AnalyticalDestination[] = [
  'overview',
  'explore',
  'fixedCosts',
  'projection',
  'scenarios',
  'savedAnalyses',
];

const IMPLEMENTED: ReadonlySet<AnalyticalDestination> = new Set<AnalyticalDestination>(['explore']);

export const DESTINATION_LABEL: Record<Destination, StringKey> = {
  overview: 'rail.overview',
  explore: 'rail.explore',
  fixedCosts: 'rail.fixedCosts',
  projection: 'rail.projection',
  scenarios: 'rail.scenarios',
  savedAnalyses: 'rail.savedAnalyses',
  settings: 'rail.settings',
};

export function isAnalytical(destination: Destination): destination is AnalyticalDestination {
  return destination !== 'settings';
}

export function isImplemented(destination: AnalyticalDestination): boolean {
  return IMPLEMENTED.has(destination);
}

/** The sentence an unbuilt destination's body shows, or null when the destination has a real surface. */
export function placeholderKey(destination: AnalyticalDestination): StringKey | null {
  return isImplemented(destination) ? null : 'rail.notInThisVersion';
}
