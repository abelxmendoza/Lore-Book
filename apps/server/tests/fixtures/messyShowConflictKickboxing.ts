import { expect } from 'vitest';

/**
 * Regression fixture: messy real-world lexical + meaning resolution.
 *
 * Covers misspellings, social conflict, emotional context, martial arts training,
 * unresolved references, and review-only ambiguity — without auto-correcting names
 * or linking to public celebrity entities.
 */
import type { LexicalAnalysisResult } from '../../src/services/lexical/lexicalTypes';
import type { MeaningResolutionResult } from '../../src/services/meaning/meaningResolutionTypes';
import type { ChatSuggestedAction } from '../../src/services/omegaChatService';

export const MESSY_SHOW_CONFLICT_KICKBOXING_ID = 'messy_show_conflict_kickboxing';

export const MESSY_SHOW_CONFLICT_KICKBOXING_TEXT =
  'Michael Fasbender was at the show at Bad Dogg Compound and who got into a fight with Charlie. It was all bad and i didnt know what to do. Ive only been learning kickboxing for 3 months now since July. I had to get the homie out of there before we were toast.';

const VENUE_CATEGORIES = new Set(['music_venue', 'event_space', 'music_venue_or_event_space']);
const MARTIAL_CATEGORIES = new Set(['martial_art', 'physical']);

export function assertMessyLexicalSnapshot(result: LexicalAnalysisResult): void {
  const personSurfaces = result.entities
    .filter((e) => e.type === 'PERSON' || (e.type === 'OBJECT' && e.subcategory === 'PROPER_NOUN'))
    .map((e) => e.surface);

  expect(
    personSurfaces.some((s) => /michael\s+fasbender/i.test(s)),
    'expected PERSON Michael Fasbender (surface form preserved)'
  ).toBe(true);
  expect(
    personSurfaces.some((s) => /^charlie$/i.test(s.trim())),
    'expected PERSON Charlie'
  ).toBe(true);
  expect(
    result.entities.every((e) => !/fassbender/i.test(e.surface)),
    'must not auto-correct Fasbender → Fassbender'
  ).toBe(true);

  const place = result.places.find((p) => /bad\s+dogg\s+compound/i.test(p.name))
    ?? result.entities.find((e) => e.type === 'PLACE' && /bad\s+dogg/i.test(e.surface));
  expect(place, 'expected Bad Dogg Compound place').toBeDefined();
  if (place && 'category' in place) {
    expect(VENUE_CATEGORIES.has(place.category as string)).toBe(true);
  }

  const kickboxingSkill = result.skills.find((s) => /kickboxing/i.test(s.name))
    ?? result.entities.find((e) => e.type === 'SKILL' && /kickboxing/i.test(e.surface));
  expect(kickboxingSkill, 'expected kickboxing skill').toBeDefined();
  if (kickboxingSkill && 'category' in kickboxingSkill) {
    expect(MARTIAL_CATEGORIES.has(String(kickboxingSkill.category))).toBe(true);
  }

  const july = result.entities.find((e) => e.type === 'DATE' && /july/i.test(e.surface));
  expect(july, 'expected July date hint').toBeDefined();
  if (july) {
    expect(july.surface).not.toMatch(/\d{4}/);
  }

  const eventKinds = result.events.map((e) => e.kind);
  expect(eventKinds).toContain('social_event');
  expect(eventKinds).toContain('conflict');
  expect(eventKinds).toContain('protective_exit');
  expect(eventKinds).toContain('training');

  const emotionLabels = result.emotions.map((e) => e.label);
  expect(emotionLabels.some((l) => /stress|distress|overwhelm/i.test(l))).toBe(true);
  expect(emotionLabels.some((l) => /uncertain|confusion|anxiety/i.test(l))).toBe(true);
  expect(emotionLabels.some((l) => /fear|threat|danger/i.test(l))).toBe(true);
  expect(emotionLabels.some((l) => /protect/i.test(l))).toBe(true);

  const flags = result.ambiguityFlags.join(' ');
  expect(flags).toMatch(/misspell|celebrity|name/i);
  expect(flags).toMatch(/fight|grammar|conflict/i);
  expect(flags).toMatch(/homie|unresolved|unnamed/i);
  expect(flags).toMatch(/july|year|date/i);
  expect(flags).toMatch(/venue|category|inferred|compound/i);

  expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  expect(result.confidence).toBeLessThanOrEqual(1);
}

export function assertMessyMeaningSnapshot(result: MeaningResolutionResult): void {
  expect(result.factuality).toBe('fact');
  expect(result.temporalContext.defaultStatus).toBe('past');

  const trainingStmt = result.temporalContext.statements.find(
    (s) => /kickboxing|learning|train/i.test(s.object) || /learning|train/i.test(s.predicate)
  );
  expect(
    trainingStmt?.status === 'present' || result.temporalContext.trainingStatus === 'present'
  ).toBe(true);

  const startHint = result.temporalContext.startHint ?? trainingStmt?.cue;
  const durationHint = result.temporalContext.durationHint;
  expect(String(startHint ?? '')).toMatch(/july/i);
  expect(String(durationHint ?? '')).toMatch(/3\s*month/i);

  const kickboxing = result.resolvedSkills.find((s) => /kickboxing/i.test(s.name));
  expect(kickboxing).toBeDefined();
  if (kickboxing) {
    expect(MARTIAL_CATEGORIES.has(kickboxing.category)).toBe(true);
    expect(kickboxing.currentOrFormer).toBe('current');
    expect(kickboxing.proficiencyHint).toMatch(/beginner|improving|unknown/i);
    expect(kickboxing.hobbyOrPaid).toMatch(/hobby|unknown/i);
    expect(kickboxing.confidence).toBeGreaterThanOrEqual(0.75);
    if (kickboxing.durationHint) expect(kickboxing.durationHint).toMatch(/3\s*month/i);
    if (kickboxing.startDateHint) expect(kickboxing.startDateHint).toMatch(/july/i);
  }

  const eventKinds = result.resolvedEvents.map((e) => e.kind);
  expect(eventKinds).toContain('social_event');
  expect(eventKinds).toContain('conflict');
  expect(eventKinds).toContain('protective_exit');
  expect(eventKinds).toContain('training');

  const conflict = result.resolvedEvents.find((e) => e.kind === 'conflict');
  expect(conflict?.requiresConfirmation || conflict?.needsReview).toBe(true);

  const homieRef = result.references.find((r) => /homie/i.test(r.reference));
  expect(homieRef?.requiresConfirmation ?? true).toBe(true);

  const thereRef = result.references.find((r) => /^there$/i.test(r.reference));
  expect(thereRef?.antecedent).toMatch(/bad\s+dogg/i);

  expect(result.resolvedEntities.every((e) => !/fassbender/i.test(e.surface))).toBe(true);
  expect(result.identityCollisions.every((c) => !/fassbender/i.test(c.name))).toBe(true);

  const ambiguityText = result.ambiguities.map((a) => `${a.code} ${a.description}`).join(' ');
  expect(ambiguityText).toMatch(/misspell|fasbender|fassbender|celebrity/i);
  expect(ambiguityText).toMatch(/fight|grammar|unclear/i);
  expect(ambiguityText).toMatch(/homie|unnamed|unresolved/i);
  expect(ambiguityText).toMatch(/july|year/i);

  const memoryClaims = result.memoryReviewCandidates.map((c) => c.claim.toLowerCase());
  expect(memoryClaims.some((c) => /show|bad\s+dogg/i.test(c))).toBe(true);
  expect(memoryClaims.some((c) => /fight|charlie|fasbender/i.test(c))).toBe(true);
  expect(memoryClaims.some((c) => /stress|uncertain|unsure|bad/i.test(c))).toBe(true);
  expect(memoryClaims.some((c) => /homie|friend|leave|escalat/i.test(c))).toBe(true);
  expect(memoryClaims.some((c) => /kickboxing|3\s*month|july/i.test(c))).toBe(true);

  for (const c of result.memoryReviewCandidates.filter((m) => /fight|conflict|toast|threat/i.test(m.claim))) {
    expect(c.requiresConfirmation).toBe(true);
  }

  const actionLabels = result.ontologyActionCandidates.map((a) => a.label.toLowerCase());
  expect(actionLabels.some((l) => /show|bad\s+dogg|event/i.test(l))).toBe(true);
  expect(actionLabels.some((l) => /michael|fasbender/i.test(l))).toBe(true);
  expect(actionLabels.some((l) => /charlie/i.test(l))).toBe(true);
  expect(actionLabels.some((l) => /bad\s+dogg|place/i.test(l))).toBe(true);
  expect(actionLabels.some((l) => /kickboxing|skill/i.test(l))).toBe(true);
  expect(actionLabels.some((l) => /fight|review/i.test(l))).toBe(true);
  expect(actionLabels.some((l) => /homie|identify/i.test(l))).toBe(true);
}

export function assertMessyPipelineMetadata(metadata: Record<string, unknown>): void {
  expect(metadata.lexical_analysis).toBeDefined();
  expect(metadata.meaning_resolution).toBeDefined();
  expect(metadata.inference_associations).toBeDefined();
  expect(metadata.ontology_enrichment).toBeDefined();
  expect(metadata.ontology_action_plan).toBeDefined();
}

export function assertMessyActionChips(actions: ChatSuggestedAction[]): void {
  const labels = actions.map((a) => a.label.toLowerCase());
  expect(labels.some((l) => /show|bad\s+dogg/i.test(l))).toBe(true);
  expect(labels.some((l) => /fasbender/i.test(l))).toBe(true);
  expect(labels.every((l) => !/fassbender/i.test(l))).toBe(true);
}
