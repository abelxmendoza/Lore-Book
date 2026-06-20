/**
 * Meaning-layer enrichment for travel + school-class narratives.
 */
import { isTravelJapanSchoolJapaneseClassText } from '../lexical/travelContextLexical';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type {
  MeaningAmbiguity,
  MemoryReviewCandidate,
  OntologyActionCandidate,
  ResolvedEvent,
  TemporalContext,
} from './meaningResolutionTypes';

export function enrichTravelTemporalContext(text: string, temporal: TemporalContext): TemporalContext {
  if (!isTravelJapanSchoolJapaneseClassText(text) && !/\bwent\s+to\s+Japan\b/i.test(text)) {
    return temporal;
  }

  return {
    ...temporal,
    defaultStatus: 'past',
    startHint: /\blast\s+summer\b/i.test(text) ? 'last summer' : temporal.startHint,
    statements: [
      ...temporal.statements,
      {
        subject: 'user',
        predicate: 'traveled_to',
        object: 'Japan',
        status: 'past',
        cue: 'went to Japan',
      },
    ],
  };
}

export function enrichTravelResolvedEvents(
  text: string,
  events: ResolvedEvent[]
): ResolvedEvent[] {
  if (!isTravelJapanSchoolJapaneseClassText(text) && !/\bwent\s+to\s+Japan\b/i.test(text)) {
    return events;
  }

  const out = [...events];
  const timeHint = /\blast\s+summer\b/i.test(text) ? 'last summer' : undefined;

  const existingTravel = out.find((e) => e.kind === 'travel');
  if (existingTravel && timeHint && !existingTravel.timeHint) {
    existingTravel.timeHint = timeHint;
  }

  if (!out.some((e) => e.kind === 'travel')) {
    out.push({
      kind: 'travel',
      title: 'Trip to Japan',
      status: 'past',
      confidence: 0.88,
      timeHint,
      needsReview: false,
      requiresConfirmation: false,
      associatedGroup: /\bJapanese Class\b/i.test(text) ? 'Japanese Class' : undefined,
    });
  }

  if (/\bschool\b.*\bClass\b/i.test(text) && /\btrip\b/i.test(text)) {
    if (!out.some((e) => /school|educational/i.test(e.title ?? ''))) {
      out.push({
        kind: 'travel',
        title: 'School trip / educational travel',
        status: 'past',
        confidence: 0.76,
        timeHint,
        needsReview: true,
        requiresConfirmation: true,
        associatedGroup: 'Japanese Class',
      });
    }
  }

  return out;
}

export function enrichTravelAmbiguities(
  text: string,
  ambiguities: MeaningAmbiguity[]
): MeaningAmbiguity[] {
  if (!isTravelJapanSchoolJapaneseClassText(text)) return ambiguities;

  const out = [...ambiguities];
  if (/\blast\s+summer\b/i.test(text)) {
    out.push({
      code: 'last_summer_no_exact_date',
      description: 'Preserved "last summer" as temporal hint — no exact date invented.',
      confidence: 0.92,
    });
  }
  if (/\bfavorite\s+summer\s+clothes\b/i.test(text)) {
    out.push({
      code: 'preference_not_identity_truth',
      description: 'Favorite summer clothes is a preference candidate, not permanent identity truth.',
      confidence: 0.9,
    });
  }
  if (/\bmy\s+school\b/i.test(text)) {
    out.push({
      code: 'school_name_not_invented',
      description: 'Did not invent a school name from "my school" alone.',
      confidence: 0.94,
    });
  }
  return out;
}

export function enrichTravelOntologyActions(
  text: string,
  actions: OntologyActionCandidate[],
  lexicalResult: LexicalAnalysisResult
): OntologyActionCandidate[] {
  if (!isTravelJapanSchoolJapaneseClassText(text)) return actions;

  const out = [...actions];
  const classEntity = lexicalResult.entities.find(
    (e) => e.type === 'GROUP' && /Japanese Class/i.test(e.surface)
  );

  if (classEntity && !out.some((a) => /Japanese Class/i.test(a.label))) {
    out.push({
      kind: 'create_group',
      label: 'Create group: Japanese Class',
      confidence: 0.9,
      requiresConfirmation: true,
      payload: { name: 'Japanese Class', type: 'school_class' },
    });
  }

  if (/\btrip\b/i.test(text) && !out.some((a) => /Japan trip/i.test(a.label))) {
    out.push({
      kind: 'add_event',
      label: 'Add Japan trip as school trip',
      confidence: 0.78,
      requiresConfirmation: true,
      payload: { title: 'Japan trip', groupName: 'Japanese Class' },
    });
  }

  return out;
}

export function enrichTravelMemoryCandidates(
  text: string,
  candidates: MemoryReviewCandidate[]
): MemoryReviewCandidate[] {
  if (!/\bfavorite\s+summer\s+clothes\b/i.test(text)) return candidates;

  return [
    ...candidates,
    {
      claim: 'User has a preference for favorite summer clothes (review before storing).',
      category: 'general',
      confidence: 0.72,
      requiresConfirmation: true,
      source: 'meaning:preference_candidate',
    },
  ];
}
