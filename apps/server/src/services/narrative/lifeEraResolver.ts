/**
 * Life Era Resolver — which months-to-years period the user is living NOW.
 *
 * The strongest current-era signal is a live work context (current role +
 * organization). Without one, recent era signals over the graph decide.
 * An era is a container: it carries the arcs active inside it (never 1:1).
 */
import { detectEraForCluster } from './eraDetectionService';
import type { AnchorBuildContext } from './narrativeAnchorTypes';
import type { WorkContext } from '../work/workContextTypes';
import type { ActiveArc, LifeEra, PersonSalience } from './narrativeCognitionTypes';

const RECENT_WINDOW_DAYS = 60;

function isRecent(iso: string | undefined, now: string): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  const n = Date.parse(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  return n - t <= RECENT_WINDOW_DAYS * 86_400_000;
}

function themesFromArcs(arcs: ActiveArc[]): string[] {
  return arcs.map((arc) => arc.title);
}

export function resolveCurrentEra(
  ctx: AnchorBuildContext,
  opts: {
    work?: WorkContext | null;
    arcs?: ActiveArc[];
    salience?: PersonSalience[];
    recencyByEntity?: Map<string, string>;
    now: string;
  },
): LifeEra | null {
  const arcs = opts.arcs ?? [];
  const salience = opts.salience ?? [];
  const majorPeople = salience.slice(0, 5).map((p) => p.name);
  const recentLocationNames = ctx.entities
    .filter(
      (e) =>
        e.entityType === 'location' &&
        isRecent(opts.recencyByEntity?.get(e.entityId), opts.now),
    )
    .slice(0, 3)
    .map((e) => e.name);
  const majorProjects = arcs
    .filter((arc) => arc.kind === 'project_build')
    .map((arc) => arc.title.replace(/^Building /, ''));

  const work = opts.work;
  if (work?.currentRole?.status === 'current' && work.organization?.name) {
    const orgLabel = work.parentOrganization?.name
      ? `${work.organization.name}/${work.parentOrganization.name}`
      : work.organization.name;
    return {
      title: `${orgLabel} Era`,
      themes: [
        ...(work.currentRole.title ? [`Working as ${work.currentRole.title}`] : []),
        ...themesFromArcs(arcs),
      ],
      startDateEstimate: work.tenure?.inferredStartDateRange?.earliest,
      majorPeople,
      majorPlaces: recentLocationNames,
      majorProjects,
      arcs,
      confidence: Math.min(0.9, 0.6 + work.currentRole.confidence * 0.3),
    };
  }

  // No live work signal — let recent entities vote for an era label.
  const recentEntityIds = ctx.entities
    .filter((e) => isRecent(opts.recencyByEntity?.get(e.entityId), opts.now))
    .map((e) => e.entityId);
  const detected = detectEraForCluster(
    recentEntityIds.length > 0 ? recentEntityIds : ctx.entities.map((e) => e.entityId),
    ctx,
  );
  if (!detected) {
    if (arcs.length === 0) return null;
    // Arcs alone can frame the era when nothing else labels it.
    return {
      title: 'Current Chapter',
      themes: themesFromArcs(arcs),
      majorPeople,
      majorPlaces: recentLocationNames,
      majorProjects,
      arcs,
      confidence: 0.4,
    };
  }

  return {
    title: detected.title,
    themes: [...detected.matchedSignals.slice(0, 3), ...themesFromArcs(arcs)],
    majorPeople,
    majorPlaces: recentLocationNames,
    majorProjects,
    arcs,
    confidence: Math.min(0.85, detected.confidence),
  };
}
