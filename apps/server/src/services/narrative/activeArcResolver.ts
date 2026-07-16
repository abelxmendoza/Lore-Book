/**
 * Active Arc Resolver — the storylines currently running inside the user's
 * era. One era contains many arcs: a new job, a project being built, a bond
 * being processed, money being stabilized — all at once.
 *
 * Detection is generic-pattern only; every title is contextualized at runtime
 * from the user's own graph (org names, project names, people).
 */
import type { AnchorBuildContext } from './narrativeAnchorTypes';
import type { WorkContext } from '../work/workContextTypes';
import type { ActiveArc, PersonSalience } from './narrativeCognitionTypes';

const JOB_ONBOARDING_RE =
  /\b(new job|first (day|week|month)|onboarding|training|learning the (job|role|ropes)|proving (myself|yourself)|probation|getting up to speed|\d+(st|nd|rd|th) week)\b/i;
const PROJECT_BUILD_RE =
  /\b(building|shipping|launching|coding|prototyping|working on) (an? |my |the )?(app|startup|project|product|tool|platform)\b/i;
const HEALING_RE =
  /\b(miss(ing)? (him|her|them)|heartbreak|broke up|breakup|moving on|healing|getting over|still think(ing)? about (him|her|them)|lonely without)\b/i;
const DISTANCE_RE =
  /\b(don'?t feel welcome|unwelcome|distanc(e|ing)|drift(ing)? (away|apart)|stepping back|pulling away|falling out|outsider|don'?t belong)\b/i;
const FINANCIAL_RE =
  /\b(debt|bills|paycheck|savings?|broke\b|financial(ly)?|money (stress|problems|trouble)|pay (off|down)|budget(ing)?|stability)\b/i;
const SOCIAL_CONFIDENCE_RE =
  /\b(social anxiety|anxious (around|in crowds)|insecure|self[- ]conscious|comparing myself|social battery|awkward|confidence|popular(ity)?)\b/i;
const HEALTH_RE = /\b(gym|working out|workout|fitness|diet|running|sleep schedule|therapy)\b/i;

type ArcSignal = {
  kind: ActiveArc['kind'];
  pattern: RegExp;
  title: (ctx: ArcTitleContext) => string;
};

type ArcTitleContext = {
  orgName?: string;
  projectName?: string;
  exName?: string;
  communityName?: string;
};

const ARC_SIGNALS: ArcSignal[] = [
  {
    kind: 'job_onboarding',
    pattern: JOB_ONBOARDING_RE,
    title: (t) => (t.orgName ? `Learning and proving yourself at ${t.orgName}` : 'Learning and proving yourself in the new role'),
  },
  {
    kind: 'project_build',
    pattern: PROJECT_BUILD_RE,
    title: (t) => (t.projectName ? `Building ${t.projectName}` : 'Building your project'),
  },
  {
    kind: 'relationship_healing',
    pattern: HEALING_RE,
    title: (t) => (t.exName ? `Processing the end of things with ${t.exName}` : 'Processing a relationship that ended'),
  },
  {
    kind: 'community_distance',
    pattern: DISTANCE_RE,
    title: (t) => (t.communityName ? `Stepping back from ${t.communityName}` : 'Stepping back from a community'),
  },
  {
    kind: 'financial_stability',
    pattern: FINANCIAL_RE,
    title: () => 'Working toward financial stability',
  },
  {
    kind: 'social_confidence',
    pattern: SOCIAL_CONFIDENCE_RE,
    title: () => 'Rebuilding social confidence',
  },
  {
    kind: 'health_fitness',
    pattern: HEALTH_RE,
    title: () => 'Taking care of your health',
  },
];

function excerpt(text: string, max = 90): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function titleContext(
  ctx: AnchorBuildContext,
  work: WorkContext | null | undefined,
  salience: PersonSalience[],
): ArcTitleContext {
  const projectOrg = ctx.organizations.find((org) => /\b(project|product|startup|app)\b/i.test(org.type ?? ''));
  const communityOrg = ctx.organizations.find((org) => /\b(band|scene|community|club|crew|collective)\b/i.test(org.type ?? ''));
  const topEx = salience.find((p) => p.category === 'partner_or_ex');
  return {
    orgName: work?.organization?.name,
    projectName: projectOrg?.name,
    exName: topEx?.name,
    communityName: communityOrg?.name,
  };
}

/**
 * Detect the arcs currently alive. Evidence comes from entity facts and event
 * titles/summaries; two or more supporting pieces make an arc 'active', one
 * makes it 'emerging'.
 */
export function resolveActiveArcs(
  ctx: AnchorBuildContext,
  opts: { work?: WorkContext | null; salience?: PersonSalience[] } = {},
): ActiveArc[] {
  const titles = titleContext(ctx, opts.work, opts.salience ?? []);
  const corpusItems: string[] = [
    ...ctx.facts.map((f) => f.text),
    ...ctx.events.map((e) => `${e.title} ${e.summary ?? ''}`),
  ];

  const arcs: ActiveArc[] = [];
  for (const signal of ARC_SIGNALS) {
    const evidence = corpusItems.filter((item) => signal.pattern.test(item)).map((item) => excerpt(item));
    // A live work context is itself evidence of the onboarding arc when tenure
    // is fresh, even if no single fact uses onboarding words.
    if (signal.kind === 'job_onboarding' && evidence.length === 0 && opts.work?.tenure?.phrase) {
      evidence.push(`tenure: ${excerpt(opts.work.tenure.phrase)}`);
    }
    if (evidence.length === 0) continue;

    const status: ActiveArc['status'] = evidence.length >= 2 ? 'active' : 'emerging';
    arcs.push({
      id: `arc-${signal.kind}`,
      kind: signal.kind,
      title: signal.title(titles),
      status,
      evidence: evidence.slice(0, 4),
      confidence: Math.min(0.9, 0.45 + evidence.length * 0.15),
    });
  }

  return arcs.sort((a, b) => b.confidence - a.confidence);
}
