/**
 * Identity Synthesizer — "who am I?" answered from patterns, not a fact dump.
 * Identity emerges from role + what's being built + who matters + the arcs
 * currently being lived, phrased like someone who knows the user's life.
 */
import type {
  ActiveArc,
  AttentionState,
  LifeEra,
  PersonSalience,
} from './narrativeCognitionTypes';
import type { WorkContext } from '../work/workContextTypes';

function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function synthesizeIdentity(opts: {
  era: LifeEra | null;
  arcs: ActiveArc[];
  salience: PersonSalience[];
  attention: AttentionState;
  work?: WorkContext | null;
}): string {
  const parts: string[] = [];

  if (opts.work?.currentRole?.title && opts.work.organization?.name) {
    parts.push(
      `Right now you're a ${opts.work.currentRole.title} at ${opts.work.organization.name}.`,
    );
  }

  const building = opts.arcs.find((arc) => arc.kind === 'project_build');
  if (building) {
    parts.push(`Outside of work, ${building.title.charAt(0).toLowerCase()}${building.title.slice(1)} is a big part of who you are.`);
  }

  if (opts.era) {
    const activeArcTitles = opts.era.arcs
      .filter((arc) => arc.kind !== 'project_build' && arc.kind !== 'job_onboarding')
      .slice(0, 3)
      .map((arc) => arc.title.toLowerCase());
    if (activeArcTitles.length > 0) {
      parts.push(`This chapter — ${opts.era.title} — also carries ${joinNames(activeArcTitles)}.`);
    }
  }

  const people = opts.salience.slice(0, 4).map((p) => p.name);
  if (people.length > 0) {
    parts.push(`The people most present in your life right now are ${joinNames(people)}.`);
  }

  const topDomain = opts.attention.domains[0];
  if (topDomain && topDomain.weight >= 0.35) {
    parts.push(`Most of your attention is going to ${topDomain.domain} at the moment.`);
  }

  return parts.join(' ');
}
