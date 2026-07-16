/**
 * Relationship Reasoner — orchestrator of the Relationship Cognition Engine.
 *
 * Detects relationship questions ("who am I interested in?", "am I over X?",
 * "who's on my mind?"), builds the evidence context once, resolves snapshots,
 * and composes an answer that supports competing simultaneous relationships
 * and never pretends certainty.
 */
import { logger } from '../../logger';
import { classifyEvidenceSource } from './relationshipConfidence';
import { resolveWorkload } from './relationshipDecay';
import { resolveAllSnapshots } from './relationshipStateResolver';
import { rankRelationshipSalience } from './relationshipSalience';
import type {
  RelationshipAnswer,
  RelationshipCognitionContext,
  RelationshipEvidence,
  RelationshipPerson,
  RelationshipQuestionKind,
  RelationshipSnapshot,
} from './relationshipCognitionTypes';

// ---------------------------------------------------------------------------
// Question detection
// ---------------------------------------------------------------------------

const ROMANTIC_INTEREST_RE =
  /\b(who am i (interested in|into|attracted to)|who do i (like|have feelings for|have a crush on)|am i (interested in|into) (anyone|someone)|who('s| is) my crush|do i like (anyone|someone)|(what about|how('s| is)) my (love|dating) life|who am i (seeing|dating|talking to) these days)\b/i;

const RELATIONSHIP_STATE_RE =
  /\b(how do i (really )?feel about|what('s| is) (going on|the deal|happening|the situation) (between me and|with me and|with)|where (do things|do we|does it) stand with|am i (over|still into|still interested in)|what('s| is) my (relationship|situation|status|thing) with)\b/i;

const THINKING_ABOUT_RE =
  /\b(who (do|am) i (keep )?think(ing)? about|who('s| is) (been )?on my mind|who do i keep coming back to|who can'?t i stop thinking about)\b/i;

export function detectRelationshipQuestion(message: string): RelationshipQuestionKind | null {
  const text = message.trim();
  if (!text) return null;
  if (THINKING_ABOUT_RE.test(text)) return 'thinking_about';
  if (ROMANTIC_INTEREST_RE.test(text)) return 'romantic_interest';
  if (RELATIONSHIP_STATE_RE.test(text)) return 'relationship_state';
  return null;
}

/** Match a named person in the question against the known cast. */
export function extractQuestionPerson(
  message: string,
  people: RelationshipPerson[],
): RelationshipPerson | null {
  const lower = message.toLowerCase();
  let best: RelationshipPerson | null = null;
  for (const person of people) {
    const name = person.name.toLowerCase();
    if (!name || name.length < 2) continue;
    if (lower.includes(name) && (!best || name.length > best.name.length)) best = person;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

const ROMANTIC_TYPE_RE = /\b(romantic|partner|girlfriend|boyfriend|spouse|ex|crush|dating|lover|situationship|fwb)\b/i;

export async function buildRelationshipContext(
  userId: string,
): Promise<RelationshipCognitionContext> {
  const { buildCognitionContext } = await import('../narrative/narrativeReasoner');
  const { resolveActiveArcs } = await import('../narrative/activeArcResolver');
  const cctx = await buildCognitionContext(userId);

  // Stored relationship labels — loaded raw; the anchor loader drops rows
  // without direct evidence, but labels are exactly what this engine weighs.
  const storedTypesByPerson = new Map<string, string[]>();
  try {
    const { supabaseAdmin } = await import('../supabaseClient');
    const { data: rows } = await supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type, summary')
      .eq('user_id', userId);
    for (const row of rows ?? []) {
      for (const id of [row.source_character_id, row.target_character_id]) {
        if (!id) continue;
        const list = storedTypesByPerson.get(id as string) ?? [];
        if (row.relationship_type) list.push(row.relationship_type as string);
        storedTypesByPerson.set(id as string, list);
      }
    }
  } catch (err) {
    logger.debug({ err, userId }, 'relationshipCognition: stored labels load failed, continuing');
  }

  const people: RelationshipPerson[] = cctx.graph.entities
    .filter((entity) => entity.entityType === 'character')
    .map((entity) => ({
      personId: entity.entityId,
      name: entity.name,
      storedRelationshipTypes: [
        ...(storedTypesByPerson.get(entity.entityId) ?? []),
        ...(entity.roles ?? []),
      ],
      closenessScore: entity.relationshipStrength,
    }));

  const evidence: RelationshipEvidence[] = [];
  let evidenceId = 0;
  const push = (personId: string, text: string, at?: string, forcedSource?: RelationshipEvidence['source']) => {
    if (!text.trim()) return;
    evidence.push({
      id: `rel-ev-${(evidenceId += 1)}`,
      personId,
      text,
      at,
      source: forcedSource ?? classifyEvidenceSource(text),
    });
  };

  for (const person of people) {
    const entity = cctx.graph.entities.find((e) => e.entityId === person.personId);
    for (const fact of entity?.facts ?? []) push(person.personId, fact);
    for (const type of storedTypesByPerson.get(person.personId) ?? []) {
      if (ROMANTIC_TYPE_RE.test(type)) {
        push(person.personId, `stored relationship: ${type}`, undefined, 'relationship_label');
      }
    }
    // A dated activity marker grounds "days since evidence" without
    // fabricating feelings — silence math needs real timestamps.
    const lastSeen = cctx.recencyByEntity.get(person.personId);
    if (lastSeen) push(person.personId, 'recent activity marker', lastSeen, 'mention');
  }

  for (const event of cctx.graph.events) {
    for (const personId of event.entityIds) {
      if (!people.some((p) => p.personId === personId)) continue;
      push(personId, `${event.title}. ${event.summary ?? ''}`, event.startDate, 'shared_experience');
    }
  }

  const arcs = resolveActiveArcs(cctx.graph, { work: cctx.work });
  let latestGlobalActivity: string | undefined;
  for (const value of cctx.recencyByEntity.values()) {
    if (!latestGlobalActivity || value > latestGlobalActivity) latestGlobalActivity = value;
  }

  return {
    userId,
    people,
    evidence,
    recencyByEntity: cctx.recencyByEntity,
    workload: resolveWorkload({ work: cctx.work, arcs, latestGlobalActivity, now: cctx.now }),
    now: cctx.now,
  };
}

// ---------------------------------------------------------------------------
// Composition — hedged, multi-relationship, reasoning visible
// ---------------------------------------------------------------------------

const OPENER = "Based on recent conversations and the broader history, ";

function frameSnapshot(snapshot: RelationshipSnapshot): string {
  const stage = snapshot.romanticStage.stage.replace(/_/g, ' ');
  if (snapshot.romanticStage.stage === 'moving_on' || snapshot.trajectory.direction === 'ended') {
    return `**${snapshot.personName}** — you've been closing this chapter; attachment is ${
      snapshot.emotionalAttachment.score >= 0.5 ? 'still easing off' : 'settling'
    }.`;
  }
  if (
    snapshot.emotionalAttachment.score >= 0.5 &&
    ['ex', 'former_partner'].includes(snapshot.romanticStage.stage)
  ) {
    return `**${snapshot.personName}** — the relationship ended, but the attachment hasn't; ${
      snapshot.personName
    } is still emotionally present (${snapshot.attention.reasons[0] ?? 'often on your mind'}).`;
  }
  if (snapshot.trajectory.direction === 'growing') {
    return `**${snapshot.personName}** — ${stage}, and growing; ${snapshot.interest.reasonBreakdown[0] ?? 'recent momentum'}.`;
  }
  if (snapshot.trajectory.direction === 'uncertain') {
    return `**${snapshot.personName}** — ${stage}; it's been quiet, but ${snapshot.trajectory.reasons[0] ?? 'silence is not evidence'}.`;
  }
  return `**${snapshot.personName}** — ${stage} (${snapshot.trajectory.direction}); ${
    snapshot.interest.reasonBreakdown[0] ?? snapshot.attention.reasons[0] ?? 'part of your story'
  }.`;
}

const ROMANTIC_STAGES_FOR_INTEREST = new Set([
  'mild_interest', 'curious', 'crush', 'strong_crush', 'infatuation', 'talking', 'dating',
  'situationship', 'hookup', 'friends_with_benefits', 'one_night_stand', 'lover', 'partner',
  'rekindling', 'moving_on', 'ex', 'former_partner',
]);

function composeRomanticInterest(snapshots: RelationshipSnapshot[]): RelationshipAnswer | null {
  const relevant = snapshots.filter(
    (s) =>
      ROMANTIC_STAGES_FOR_INTEREST.has(s.romanticStage.stage) &&
      (s.interest.score >= 20 || s.emotionalAttachment.score >= 0.45),
  );
  const ranked = rankRelationshipSalience(relevant, { max: 4 });
  if (ranked.length === 0) return null;

  const lines = ranked.map((item) => `- ${frameSnapshot(item.snapshot)}`);
  const multi =
    ranked.length > 1
      ? '\n\nThese aren\'t in competition — several things can be true at once: processing one bond while another grows is exactly how it works.'
      : '';
  return {
    kind: 'romantic_interest',
    content: `${OPENER}here's where your interest and attachment actually sit:\n\n${lines.join('\n')}${multi}\n\nI'd rather show you the shape of it than pretend one label fits.`,
    confidence: Math.min(0.75, ranked[0].snapshot.confidence),
    reasoning: ranked.map((item) => item.snapshot.reasonSummary),
  };
}

function composeRelationshipState(
  snapshot: RelationshipSnapshot | undefined,
): RelationshipAnswer | null {
  if (!snapshot) return null;
  const stage = snapshot.romanticStage.stage.replace(/_/g, ' ');
  const lines: string[] = [
    `${OPENER}with **${snapshot.personName}** this looks like: ${stage}, trending ${snapshot.trajectory.direction} (${Math.round(snapshot.trajectory.probability * 100)}% read).`,
  ];
  const interest = snapshot.interest.score;
  const attachment = Math.round(snapshot.emotionalAttachment.score * 100);
  if (Math.abs(interest - attachment) >= 25) {
    lines.push(
      interest > attachment
        ? `Interest (${interest}/100) is running ahead of emotional attachment (${attachment}/100) — attraction and attachment are different things.`
        : `Emotional attachment (${attachment}/100) is running deeper than active interest (${interest}/100) — attachment and status are different things.`,
    );
  } else {
    lines.push(`Interest sits around ${interest}/100 and attachment around ${attachment}/100.`);
  }
  if (snapshot.trajectory.reasons[0]) lines.push(`Why: ${snapshot.trajectory.reasons[0]}.`);
  lines.push('Tell me if I have this wrong — your word overrides anything I inferred.');
  return {
    kind: 'relationship_state',
    content: lines.join('\n\n'),
    confidence: Math.min(0.75, snapshot.confidence),
    reasoning: [snapshot.reasonSummary, ...snapshot.trajectory.reasons],
  };
}

function composeThinkingAbout(snapshots: RelationshipSnapshot[]): RelationshipAnswer | null {
  const thinking = snapshots
    .filter((s) => s.attention.thinkingScore >= 0.3)
    .sort((a, b) => b.attention.thinkingScore - a.attention.thinkingScore)
    .slice(0, 4);
  if (thinking.length === 0) return null;
  const lines = thinking.map(
    (s) =>
      `- **${s.personName}** — ${s.attention.reasons[0] ?? 'recurring emotional references'}`,
  );
  return {
    kind: 'thinking_about',
    content: `${OPENER}the people occupying your headspace — which isn't the same as who you talk about:\n\n${lines.join('\n')}`,
    confidence: 0.6,
    reasoning: thinking.map((s) => `${s.personName}: thinking ${s.attention.thinkingScore} vs talking ${s.attention.talkingScore}`),
  };
}

/** Pure composition over a prebuilt context — the testable core. */
export function answerRelationshipQuestion(
  kind: RelationshipQuestionKind,
  ctx: RelationshipCognitionContext,
  opts: { message?: string } = {},
): RelationshipAnswer | null {
  if (ctx.people.length === 0 || ctx.evidence.length === 0) return null;
  const snapshots = resolveAllSnapshots(ctx);
  if (snapshots.length === 0) return null;

  switch (kind) {
    case 'romantic_interest':
      return composeRomanticInterest(snapshots);
    case 'thinking_about':
      return composeThinkingAbout(snapshots);
    case 'relationship_state': {
      const person = opts.message ? extractQuestionPerson(opts.message, ctx.people) : null;
      if (!person) return null;
      return composeRelationshipState(snapshots.find((s) => s.personId === person.personId));
    }
    default:
      return null;
  }
}

/** Load + resolve + compose. Null means: fall through to normal chat. */
export async function answerRelationshipCognition(
  userId: string,
  kind: RelationshipQuestionKind,
  message: string,
): Promise<RelationshipAnswer | null> {
  try {
    const ctx = await buildRelationshipContext(userId);
    return answerRelationshipQuestion(kind, ctx, { message });
  } catch (err) {
    logger.warn({ err, userId, kind }, 'relationshipCognition: answer failed, falling back to chat');
    return null;
  }
}
