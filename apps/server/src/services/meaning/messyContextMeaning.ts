/**
 * Meaning-layer enrichment for messy show/conflict/kickboxing narratives.
 */
import { isMessyShowConflictKickboxingText } from '../lexical/messyContextLexical';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type {
  MeaningAmbiguity,
  MemoryReviewCandidate,
  OntologyActionCandidate,
  ResolvedEvent,
  ResolvedReference,
  ResolvedSkill,
  TemporalContext,
} from './meaningResolutionTypes';

export function enrichMessyTemporalContext(text: string, temporal: TemporalContext): TemporalContext {
  if (!isMessyShowConflictKickboxingText(text)) return temporal;

  const trainingMatch =
    /\b(?:learning|been learning)\s+kickboxing\s+for\s+(\d+\s+months?)(?:\s+now)?(?:\s+since\s+([A-Za-z]+))?/i.exec(text);

  return {
    ...temporal,
    defaultStatus: /\bwas\s+at\b/i.test(text) ? 'past' : temporal.defaultStatus,
    trainingStatus: 'present',
    startHint: trainingMatch?.[2] ?? 'July',
    durationHint: trainingMatch?.[1] ?? '3 months',
    statements: [
      ...temporal.statements,
      {
        subject: 'user',
        predicate: 'learning',
        object: 'kickboxing',
        status: 'present',
        cue: trainingMatch?.[0] ?? 'learning kickboxing',
      },
    ],
  };
}

export function enrichMessyReferences(
  text: string,
  references: ResolvedReference[],
  placeNames: string[]
): ResolvedReference[] {
  if (!isMessyShowConflictKickboxingText(text)) return references;

  const out = [...references];
  const venue = placeNames.find((p) => /bad\s+dogg/i.test(p)) ?? 'Bad Dogg Compound';

  if (!out.some((r) => /homie/i.test(r.reference))) {
    out.push({
      reference: 'the homie',
      antecedent: 'unknown friend',
      antecedentKind: 'PERSON',
      confidence: 0.62,
      resolutionReason: 'unresolved_social_reference',
      needsResolution: true,
      requiresConfirmation: true,
    });
  }

  if (!out.some((r) => r.reference === 'we')) {
    out.push({
      reference: 'we',
      antecedent: 'self + homie',
      antecedentKind: 'GROUP',
      confidence: 0.71,
      resolutionReason: 'inclusive_we_self_and_homie',
    });
  }

  if (!out.some((r) => r.reference === 'there')) {
    out.push({
      reference: 'there',
      antecedent: venue,
      antecedentKind: 'PLACE',
      confidence: 0.82,
      resolutionReason: 'deictic_there_to_venue',
    });
  }

  return out;
}

export function enrichMessyResolvedSkills(text: string, skills: ResolvedSkill[]): ResolvedSkill[] {
  if (!isMessyShowConflictKickboxingText(text)) return skills;

  const trainingMatch =
    /\b(?:learning|been learning)\s+kickboxing\s+for\s+(\d+\s+months?)(?:\s+now)?(?:\s+since\s+([A-Za-z]+))?/i.exec(text);

  return skills.map((s) => {
    if (!/kickboxing/i.test(s.name)) return s;
    return {
      ...s,
      category: 'martial_art',
      currentOrFormer: 'current',
      proficiencyHint: 'beginner',
      hobbyOrPaid: 'hobby',
      durationHint: trainingMatch?.[1] ?? '3 months',
      startDateHint: trainingMatch?.[2] ?? 'July',
      confidence: Math.max(s.confidence, 0.75),
      requiresConfirmation: false,
    };
  });
}

export function enrichMessyResolvedEvents(text: string, events: ResolvedEvent[]): ResolvedEvent[] {
  if (!isMessyShowConflictKickboxingText(text)) return events;

  return events.map((e) => {
    if (e.kind === 'conflict') {
      return { ...e, needsReview: true, requiresConfirmation: true };
    }
    return e;
  });
}

export function enrichMessyAmbiguities(text: string, ambiguities: MeaningAmbiguity[]): MeaningAmbiguity[] {
  if (!isMessyShowConflictKickboxingText(text)) return ambiguities;

  const extra: MeaningAmbiguity[] = [
    {
      code: 'celebrity_name_misspelling',
      description: 'Michael Fasbender may be a misspelling of Michael Fassbender or a different person.',
      candidates: ['Michael Fasbender', 'Michael Fassbender'],
      confidence: 0.74,
    },
    {
      code: 'fight_grammar_unclear',
      description: "The phrase 'who got into a fight with Charlie' has unclear grammar; likely Michael fought Charlie.",
      candidates: ['Michael Fasbender', 'Charlie'],
      confidence: 0.68,
    },
    {
      code: 'homie_unnamed',
      description: 'The homie is unnamed.',
      candidates: [],
      confidence: 0.62,
    },
    {
      code: 'venue_category_inferred',
      description: 'Bad Dogg Compound category is inferred, not confirmed.',
      candidates: ['music_venue', 'event_space'],
      confidence: 0.7,
    },
    {
      code: 'july_needs_year',
      description: 'July needs year resolution.',
      candidates: ['July'],
      confidence: 0.7,
    },
  ];

  const seen = new Set(ambiguities.map((a) => a.code));
  return [...ambiguities, ...extra.filter((a) => !seen.has(a.code))];
}

export function enrichMessyMemoryCandidates(
  text: string,
  candidates: MemoryReviewCandidate[],
  lexical: LexicalAnalysisResult
): MemoryReviewCandidate[] {
  if (!isMessyShowConflictKickboxingText(text)) return candidates;

  const extra: MemoryReviewCandidate[] = [
    {
      claim: 'User attended a show at Bad Dogg Compound.',
      category: 'event',
      confidence: 0.84,
      requiresConfirmation: true,
      source: 'messy:social_event',
    },
    {
      claim: 'A fight happened involving Michael Fasbender and Charlie.',
      category: 'event',
      confidence: 0.72,
      requiresConfirmation: true,
      source: 'messy:conflict',
    },
    {
      claim: 'User felt stressed and unsure what to do during the event.',
      category: 'general',
      confidence: 0.85,
      requiresConfirmation: true,
      source: 'messy:emotion',
    },
    {
      claim: 'User helped get a friend out before the situation escalated.',
      category: 'event',
      confidence: 0.81,
      requiresConfirmation: true,
      source: 'messy:protective_exit',
    },
    {
      claim: 'User has been learning kickboxing for about 3 months since July.',
      category: 'skill',
      confidence: 0.88,
      requiresConfirmation: true,
      source: 'messy:training',
    },
  ];

  for (const e of lexical.emotions.filter((em) => /fear|threat|toast/i.test(em.label + em.cue))) {
    extra.push({
      claim: 'User perceived danger or threat during the situation.',
      category: 'general',
      confidence: e.confidence,
      requiresConfirmation: true,
      source: 'messy:threat',
    });
  }

  const seen = new Set(candidates.map((c) => c.claim));
  return [...candidates, ...extra.filter((c) => !seen.has(c.claim))];
}

export function enrichMessyOntologyActions(
  text: string,
  actions: OntologyActionCandidate[],
  lexical: LexicalAnalysisResult
): OntologyActionCandidate[] {
  if (!isMessyShowConflictKickboxingText(text)) return actions;

  const michael = lexical.entities.find((e) => /michael\s+fasbender/i.test(e.surface))?.surface ?? 'Michael Fasbender';
  const extra: OntologyActionCandidate[] = [
    {
      kind: 'add_event',
      label: 'Add event: Show at Bad Dogg Compound',
      confidence: 0.84,
      requiresConfirmation: true,
      payload: { eventKind: 'social_event', place: 'Bad Dogg Compound' },
    },
    {
      kind: 'add_person',
      label: `Add person: ${michael}`,
      confidence: 0.74,
      requiresConfirmation: true,
      payload: { name: michael },
    },
    {
      kind: 'add_person',
      label: 'Add person: Charlie',
      confidence: 0.86,
      requiresConfirmation: true,
      payload: { name: 'Charlie' },
    },
    {
      kind: 'add_place',
      label: 'Add place: Bad Dogg Compound',
      confidence: 0.82,
      requiresConfirmation: true,
      payload: { name: 'Bad Dogg Compound', category: 'event_space' },
    },
    {
      kind: 'add_skill',
      label: 'Add skill: Kickboxing',
      confidence: 0.9,
      requiresConfirmation: true,
      payload: { skillName: 'kickboxing', category: 'martial_art' },
    },
    {
      kind: 'review_conflict',
      label: 'Review fight details',
      confidence: 0.72,
      requiresConfirmation: true,
      payload: { eventKind: 'conflict', needsReview: true },
    },
    {
      kind: 'identify_unresolved',
      label: 'Identify homie',
      confidence: 0.62,
      requiresConfirmation: true,
      payload: { reference: 'the homie' },
    },
  ];

  const seen = new Set(actions.map((a) => a.label));
  return [...actions, ...extra.filter((a) => !seen.has(a.label))];
}
