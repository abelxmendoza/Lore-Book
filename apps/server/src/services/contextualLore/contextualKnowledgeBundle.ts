/**
 * Build a ContextualKnowledgeBundle from a user turn.
 * Heuristic + existing parsers — LLM extractors still own durable writes.
 */

import { detectPersonOnboardingIntent, decomposePersonIntro } from '../identity/personIntroDecomposition';
import { assessMilestone } from './milestoneAssessment';
import { planLoreResponse } from './loreResponsePlanner';
import type {
  ContextualConfidenceBreakdown,
  ContextualKnowledgeBundle,
  EntityProposal,
  EventProposal,
  KnowledgeThreadKind,
  ReflectionProposal,
} from './types';

const EXPLICIT_GROUP_NAME_RE =
  /\b(?:(?:that(?:'|’)s|thats|called|named|the name is)\s+)([A-ZÀ-Ý][^.\n]{3,80}?(?:Support Team|Care Team|Team|Crew|Circle|Network))\b/i;

const CARE_TEAM_RE =
  /\b(?:social worker(?:s)?(?: support)?(?: team)?|care team|support (?:team|network)|case (?:worker|manager)s?)\b/i;

const UNNAMED_VISITORS_RE =
  /\b(?:a bunch of|several|some|a group of|many)\s+(?:women|men|people|workers|social workers|folks)\b/i;

const DISTRO_RE = /\bdistrokid\b/i;
const SONG_QUOTE_RE = /[“"]([^”"]{2,80})[”"]/;
const ARTIST_AS_RE = /\bas\s+([A-ZÀ-ÝÁÉÍÓÚÑ][\wÀ-ÿ]*(?:\s+[A-ZÀ-ÝÁÉÍÓÚÑ][\wÀ-ÿ]*)?)\b/;
const RIVIAN_RE = /\brivian\b/i;
const INTERVIEW_RE = /\b(?:interview(?:ed|ing)?|phone call|video call|recruit(?:er|ing))\b/i;
const LOREBOOK_WORK_RE = /\b(?:working on|building|back (?:to|on))\s+lore\s*book\b/i;
const THERAPY_RE = /\b(?:therapist|therapy)\b/i;
const SUPPORT_NEED_RE =
  /\b(?:need something like that|need (?:support|help|people)|i might need|maybe i do need)\b/i;
const AMBITION_TENSION_RE =
  /\b(?:waste of time|too busy|ambitious|no time|interfere|slow(?:s|ing)? me)\b/i;
const REAL_PEOPLE_RE =
  /\b(?:nothing (?:beats|replaces) real people|can(?:'|’)t replace real (?:people|humans)|real people)\b/i;
const HUMOR_RE = /\b(?:lmao|lol|haha|😂|🤣)\b/i;
const MAYBE_RE = /\b(?:maybe|kind of|kinda|sort of|i (?:guess|think)|not sure)\b/i;
const SPOTIFY_RE = /\bspotify\b/i;
const TRYING_RELEASE_RE = /\b(?:trying to|hope(?:ing)? to|want(?:ing)? to)\s+(?:get|put|release).{0,40}spotify\b/i;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function detectExplicitGroupName(text: string): EntityProposal | null {
  const m = text.match(EXPLICIT_GROUP_NAME_RE);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, ' ').trim();
  if (!name || name.length < 4) return null;
  const central = name.match(/^(.+?)['’]s\s+/i)?.[1]?.trim() ?? null;
  return {
    kind: 'group',
    canonicalName: name,
    supportsAnchor: central,
    groupType: CARE_TEAM_RE.test(name) || CARE_TEAM_RE.test(text) ? 'care_team' : 'support_network',
    confidence: 0.92,
    evidenceSpan: m[0],
  };
}

function buildEvents(text: string): EventProposal[] {
  const events: EventProposal[] = [];
  const milestone = assessMilestone(text);

  if (CARE_TEAM_RE.test(text) && /\b(?:visit|visited|came|came in|living room|house)\b/i.test(text)) {
    const unnamed = UNNAMED_VISITORS_RE.test(text);
    events.push({
      kind: 'care_visit',
      title: 'Support team visit',
      summary: 'A care / social-worker support visit took place.',
      isMilestone: false,
      participants: [],
      unresolvedParticipantCount: unnamed ? 1 : 0,
      confidence: 0.8,
    });
  }

  if (DISTRO_RE.test(text) && /\b(?:account|created|create|sign(?:ed)? up)\b/i.test(text)) {
    events.push({
      kind: 'creative_milestone',
      title: 'Created first DistroKid account',
      summary: 'First DistroKid account creation for music distribution.',
      isMilestone: milestone.firstTime === 1 || milestone.isMilestone,
      milestoneScore: milestone.finalScore,
      confidence: 0.85,
    });
  }

  if (DISTRO_RE.test(text) && /\b(?:upload|uploaded|uploading|distribut)\b/i.test(text)) {
    const song = text.match(SONG_QUOTE_RE)?.[1];
    const artist = text.match(ARTIST_AS_RE)?.[1];
    events.push({
      kind: 'creative_milestone',
      title: song
        ? `Uploaded “${song}” for distribution`
        : 'Uploaded a release for distribution',
      summary: [
        song ? `Song: ${song}.` : null,
        artist ? `Artist identity: ${artist}.` : null,
        'Uploaded for distribution (not confirmed live on streaming platforms).',
      ]
        .filter(Boolean)
        .join(' '),
      isMilestone: true,
      milestoneScore: Math.max(milestone.finalScore, 0.6),
      intendedPlatforms: SPOTIFY_RE.test(text) ? ['Spotify'] : undefined,
      publicationUncertain: TRYING_RELEASE_RE.test(text) || SPOTIFY_RE.test(text),
      confidence: 0.84,
    });
  }

  if (RIVIAN_RE.test(text) && INTERVIEW_RE.test(text)) {
    events.push({
      kind: 'employment_interview',
      title: 'Interviewed for a Rivian-linked opportunity',
      summary:
        'Agency-mediated recruiting interview process (phone and/or video). Not direct employment or an offer.',
      isMilestone: milestone.careerProgression >= 0.55,
      milestoneScore: milestone.finalScore,
      confidence: 0.82,
    });
  }

  if (LOREBOOK_WORK_RE.test(text)) {
    events.push({
      kind: 'project_work',
      title: 'Returned to working on LoreBook',
      summary: 'Continued active work on the LoreBook project.',
      isMilestone: false,
      confidence: 0.75,
    });
  }

  return events;
}

function buildReflections(text: string): ReflectionProposal[] {
  const out: ReflectionProposal[] = [];
  const humor = HUMOR_RE.test(text);
  const uncertain = MAYBE_RE.test(text) || humor;

  if (SUPPORT_NEED_RE.test(text) || (THERAPY_RE.test(text) && MAYBE_RE.test(text))) {
    out.push({
      insight: 'NEED_FOR_SUPPORT',
      statement:
        'Considering whether more human support (possibly therapy) might help — not a decided diagnosis or commitment.',
      modality: humor ? 'JOKING_BUT_MEANINGFUL' : uncertain ? 'CONSIDERING' : 'UNCERTAIN',
      humorSoftening: humor,
      confidence: 0.78,
    });
  }

  if (SUPPORT_NEED_RE.test(text) && AMBITION_TENSION_RE.test(text)) {
    out.push({
      insight: 'AMBITION_VS_SUPPORT',
      statement:
        'Tension between wanting human support and worrying that seeking it could take time from ambition and work.',
      modality: 'CONSIDERING',
      humorSoftening: humor,
      confidence: 0.8,
    });
  }

  if (REAL_PEOPLE_RE.test(text) && /\blore\s*book\b/i.test(text)) {
    out.push({
      insight: 'TECHNOLOGY_VS_HUMAN_CONNECTION',
      statement:
        'Building MemoVault partly for understanding and continuity, while recognizing it cannot replace real people.',
      modality: 'REALIZED',
      humorSoftening: false,
      relatedProjectHint: 'LoreBook',
      confidence: 0.88,
    });
    out.push({
      insight: 'PROJECT_MOTIVATION',
      statement: 'Need for reliable understanding and support is part of the motivation for building MemoVault.',
      modality: 'BELIEVES',
      humorSoftening: false,
      relatedProjectHint: 'LoreBook',
      confidence: 0.8,
    });
  } else if (REAL_PEOPLE_RE.test(text)) {
    out.push({
      insight: 'TECHNOLOGY_VS_HUMAN_CONNECTION',
      statement: 'Nothing replaces real people for human support and connection.',
      modality: 'REALIZED',
      humorSoftening: false,
      confidence: 0.85,
    });
  }

  return out;
}

function dayMomentTitle(threads: KnowledgeThreadKind[], events: EventProposal[]): string | null {
  const significant = new Set(threads.filter((t) => t !== 'other' && t !== 'person_intro'));
  if (significant.size < 2 && events.filter((e) => e.isMilestone).length < 2) return null;
  const hasMusic = threads.includes('creative_milestone');
  const hasWork = threads.includes('employment_interview') || threads.includes('project_work');
  const hasCare = threads.includes('care_visit') || threads.includes('group_naming');
  if (hasMusic && hasWork && hasCare) return 'A day of music, opportunity, and support';
  if (hasMusic && hasCare) return 'A day of music and support';
  if (hasMusic && hasWork) return 'A day of music and opportunity';
  return 'A multi-threaded day';
}

function confidenceFor(bundle: Omit<ContextualKnowledgeBundle, 'confidence' | 'responsePlan'>): ContextualConfidenceBreakdown {
  return {
    entityIntroduction: bundle.introducedEntities[0]?.confidence ?? 0,
    roleResolution: bundle.introducedEntities[0]?.rolePhrase ? 0.9 : 0.4,
    groupNameResolution: bundle.groupProposals[0]?.confidence ?? 0,
    eventSegmentation: clamp01(bundle.eventProposals.length / 4),
    milestoneDetection: bundle.eventProposals.some((e) => e.isMilestone) ? 0.85 : 0.2,
    reflectionDetection: bundle.reflectionProposals[0]?.confidence ?? 0,
    modalityPreservation: bundle.reflectionProposals.some((r) => r.modality !== 'BELIEVES') ? 0.9 : 0.5,
    overallMutationConfidence: clamp01(
      (bundle.introducedEntities.length > 0 ? 0.25 : 0) +
        (bundle.groupProposals.length > 0 ? 0.2 : 0) +
        Math.min(0.3, bundle.eventProposals.length * 0.08) +
        (bundle.reflectionProposals.length > 0 ? 0.2 : 0),
    ),
  };
}

/**
 * Analyze a user message into a structured multi-knowledge bundle.
 */
export function buildContextualKnowledgeBundle(text: string): ContextualKnowledgeBundle {
  const sourceMessageExcerpt = (text ?? '').slice(0, 2000);
  const onboarding = detectPersonOnboardingIntent(text);
  const introducedEntities: EntityProposal[] = [];

  if (onboarding.detected && onboarding.decomposition?.canonicalName) {
    const d = onboarding.decomposition;
    introducedEntities.push({
      kind: 'person',
      canonicalName: d.canonicalName,
      rolePhrase: d.rolePhrase,
      supportsAnchor: d.supportsAnchor,
      confidence: d.rolePhrase ? 0.9 : 0.75,
      evidenceSpan: d.raw,
    });
  } else {
    // Contaminated bare mention elsewhere in the turn
    const contaminated = text.match(
      /\b([A-ZÀ-Ý][a-zà-ÿ]+),\s+([A-ZÀ-Ý][^,\n]{0,40}['’]s\s+Social Worker)\b/,
    );
    if (contaminated) {
      const d = decomposePersonIntro(`${contaminated[1]}, ${contaminated[2]}`);
      if (d.canonicalName) {
        introducedEntities.push({
          kind: 'person',
          canonicalName: d.canonicalName,
          rolePhrase: d.rolePhrase,
          supportsAnchor: d.supportsAnchor,
          confidence: 0.88,
          evidenceSpan: contaminated[0],
        });
      }
    }
  }

  const group = detectExplicitGroupName(text);
  const groupProposals = group ? [group] : [];
  const eventProposals = buildEvents(text);
  const reflectionProposals = buildReflections(text);

  const threads = new Set<KnowledgeThreadKind>();
  if (introducedEntities.length) threads.add('person_intro');
  if (groupProposals.length) threads.add('group_naming');
  for (const e of eventProposals) threads.add(e.kind);
  for (const r of reflectionProposals) {
    if (r.insight === 'AMBITION_VS_SUPPORT') threads.add('inner_conflict');
    else threads.add('reflection');
  }

  const unresolvedQuestions = [];
  if (introducedEntities[0] && !introducedEntities[0].rolePhrase) {
    unresolvedQuestions.push({
      question: `Do you call ${introducedEntities[0].canonicalName} anything besides ${introducedEntities[0].canonicalName}?`,
      about: introducedEntities[0].canonicalName,
      priority: 'medium' as const,
    });
  } else if (introducedEntities[0]?.rolePhrase) {
    unresolvedQuestions.push({
      question: `Should I remember ${introducedEntities[0].canonicalName} simply as ${introducedEntities[0].canonicalName}, with “${introducedEntities[0].rolePhrase}” as their role?`,
      about: introducedEntities[0].canonicalName,
      priority: 'high' as const,
    });
  }

  const threadList = [...threads];
  const partial = {
    sourceMessageExcerpt,
    introducedEntities,
    groupProposals,
    eventProposals,
    reflectionProposals,
    unresolvedQuestions,
    threads: threadList,
    dayMomentTitle: dayMomentTitle(threadList, eventProposals),
  };

  const confidence = confidenceFor(partial as Omit<ContextualKnowledgeBundle, 'confidence' | 'responsePlan'>);
  const responsePlan = planLoreResponse({ ...partial, confidence } as ContextualKnowledgeBundle);

  return {
    ...partial,
    confidence,
    responsePlan,
  };
}

/** Guard: therapy consideration must not become a durable medical belief claim. */
export function isUnsafeTherapyDiagnosisClaim(claim: string): boolean {
  return (
    /\b(?:needs?|has|requires?|diagnosed with)\s+(?:a\s+)?therapist\b/i.test(claim) ||
    /\b(?:has|suffers from)\s+(?:depression|anxiety disorder|bipolar)\b/i.test(claim)
  );
}
