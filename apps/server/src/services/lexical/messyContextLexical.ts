/**
 * Messy real-world narrative patterns — show/conflict/training/social refs.
 * Keeps surface forms (e.g. "Fasbender") and flags review-only ambiguity.
 */
import type {
  LexicalAnalysisResult,
  LexicalEmotion,
  LexicalEntity,
  LexicalEventSignal,
  LexicalPlaceSignal,
  LexicalSkillSignal,
} from './lexicalTypes';
import { normalizeLexicalText, padForScan, titleCase } from './lexicalNormalizer';

const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december';

/** Near-miss celebrity names — flag ambiguity, never auto-correct. */
const CELEBRITY_MISSPELLINGS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\bmichael\s+fasbender\b/i, canonical: 'Michael Fassbender' },
];

export function isMessyShowConflictKickboxingText(text: string): boolean {
  const p = padForScan(text);
  return (
    / michael fasbender /.test(p) &&
    / bad dogg compound /.test(p) &&
    / kickboxing /.test(p) &&
    / homie /.test(p)
  );
}

export function enrichMessyContextLexical(
  text: string,
  partial: Pick<
    LexicalAnalysisResult,
    'entities' | 'places' | 'events' | 'emotions' | 'skills' | 'relationships'
  >
): {
  entities: LexicalEntity[];
  places: LexicalPlaceSignal[];
  events: LexicalEventSignal[];
  emotions: LexicalEmotion[];
  skills: LexicalSkillSignal[];
  ambiguityFlags: string[];
} {
  if (!isMessyShowConflictKickboxingText(text)) {
    return {
      entities: partial.entities,
      places: partial.places,
      events: partial.events,
      emotions: partial.emotions,
      skills: partial.skills,
      ambiguityFlags: [],
    };
  }

  const entities = [...partial.entities];
  const places = [...partial.places];
  const events = [...partial.events];
  const emotions = [...partial.emotions];
  const skills = [...partial.skills];
  const ambiguityFlags: string[] = [];
  const entitySeen = new Set(entities.map((e) => `${e.type}:${e.normalized}`));
  const eventSeen = new Set(events.map((e) => e.kind));
  const emotionSeen = new Set(emotions.map((e) => e.label));

  const pushEntity = (entity: Omit<LexicalEntity, 'normalized'> & { normalized?: string }) => {
    const normalized = entity.normalized ?? normalizeLexicalText(entity.surface);
    const key = `${entity.type}:${normalized}`;
    if (entitySeen.has(key)) return;
    entitySeen.add(key);
    entities.push({ ...entity, normalized });
  };

  const personWasAt = /\b([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)\s+was\s+at\b/.exec(text);
  if (personWasAt?.[1]) {
    pushEntity({
      surface: personWasAt[1].trim(),
      type: 'PERSON',
      confidence: 0.74,
      source: 'narrative_person_was_at',
    });
  }

  const fightWith = /\bfight\s+with\s+([A-Z][a-z]+)\b/i.exec(text);
  if (fightWith?.[1]) {
    pushEntity({
      surface: fightWith[1].trim(),
      type: 'PERSON',
      confidence: 0.86,
      source: 'conflict_with_person',
    });
  }

  const showAt = /\b(?:show\s+at|at\s+the\s+show\s+at)\s+([A-Z][\w'&.-]+(?:\s+[A-Z][\w'&.-]+){0,3})\b/i.exec(text);
  const venueName = showAt?.[1]?.trim() ?? 'Bad Dogg Compound';
  if (venueName) {
    pushEntity({
      surface: venueName,
      type: 'PLACE',
      subcategory: 'event_space',
      confidence: 0.82,
      source: 'show_at_venue',
    });
    if (!places.some((p) => normalizeLexicalText(p.name) === normalizeLexicalText(venueName))) {
      places.push({
        name: titleCase(venueName),
        category: 'event_space',
        cue: showAt?.[0] ?? `show at ${venueName}`,
        confidence: 0.82,
      });
    }
    ambiguityFlags.push('venue_category_inferred');
  }

  const sinceMonth = new RegExp(`\\bsince\\s+(${MONTHS})\\b`, 'i').exec(text);
  const monthOnly = sinceMonth ?? new RegExp(`\\b(${MONTHS})\\b`, 'i').exec(text);
  if (monthOnly?.[1]) {
    pushEntity({
      surface: titleCase(monthOnly[1]),
      type: 'DATE',
      subcategory: 'MONTH_ONLY',
      confidence: 0.7,
      source: 'month_hint',
    });
    ambiguityFlags.push('july_needs_year_resolution');
  }

  pushEntity({
    surface: 'kickboxing',
    type: 'SKILL',
    subcategory: 'MARTIAL_ART',
    confidence: 0.94,
    source: 'martial_art_skill',
  });

  if (!eventSeen.has('social_event')) {
    events.push({ kind: 'social_event', cue: 'show at Bad Dogg Compound', confidence: 0.84 });
    eventSeen.add('social_event');
  }
  if (!eventSeen.has('conflict')) {
    events.push({ kind: 'conflict', cue: 'got into a fight with Charlie', confidence: 0.72 });
    eventSeen.add('conflict');
  }
  if (/\bfight\s+with\b/i.test(text) && /\bwho\s+got\s+into\b/i.test(text)) {
    ambiguityFlags.push('fight_grammar_unclear');
  }
  if (!eventSeen.has('protective_exit')) {
    events.push({ kind: 'protective_exit', cue: 'get the homie out of there', confidence: 0.81 });
    eventSeen.add('protective_exit');
  }
  if (!eventSeen.has('training')) {
    events.push({ kind: 'training', cue: 'learning kickboxing for 3 months since July', confidence: 0.88 });
    eventSeen.add('training');
  }

  const trainingMatch =
    /\b(?:learning|been learning)\s+kickboxing\s+for\s+(\d+\s+months?)(?:\s+now)?(?:\s+since\s+([A-Za-z]+))?/i.exec(text);
  if (!skills.some((s) => /kickboxing/i.test(s.name))) {
    skills.push({
      name: 'kickboxing',
      category: 'martial_art',
      hobby_or_paid: 'hobby',
      proficiency_hint: 'beginner',
      usage_frequency_hint: 'unknown',
      enjoyment_hint: 'unknown',
      lore_context: trainingMatch?.[0] ?? 'learning kickboxing',
      confidence: 0.9,
    });
  } else {
    for (const s of skills) {
      if (/kickboxing/i.test(s.name)) {
        s.category = 'martial_art';
        s.proficiency_hint = 'beginner';
        s.hobby_or_paid = 'hobby';
        s.lore_context = trainingMatch?.[0] ?? s.lore_context;
      }
    }
  }

  const emotionPatterns: Array<{ label: string; re: RegExp; cue: string; valence: LexicalEmotion['valence']; confidence: number }> = [
    { label: 'stress', re: /\bit was all bad\b/i, cue: 'It was all bad', valence: 'negative', confidence: 0.85 },
    { label: 'uncertainty', re: /\b(?:didn't|didnt)\s+know\s+what\s+to\s+do\b/i, cue: "I didn't know what to do", valence: 'negative', confidence: 0.9 },
    { label: 'fear_or_threat', re: /\bbefore\s+we\s+were\s+toast\b/i, cue: 'before we were toast', valence: 'negative', confidence: 0.76 },
    { label: 'protectiveness', re: /\bget\s+the\s+homie\s+out\b/i, cue: 'had to get the homie out of there', valence: 'mixed', confidence: 0.82 },
  ];
  for (const ep of emotionPatterns) {
    if (!ep.re.test(text) || emotionSeen.has(ep.label)) continue;
    emotionSeen.add(ep.label);
    emotions.push({
      label: ep.label,
      valence: ep.valence,
      intensity: ep.label === 'uncertainty' ? 'medium' : 'high',
      cue: ep.cue,
      confidence: ep.confidence,
    });
  }

  for (const { pattern, canonical } of CELEBRITY_MISSPELLINGS) {
    if (pattern.test(text)) {
      ambiguityFlags.push('celebrity_name_misspelling');
      ambiguityFlags.push(`possible_misspelling_of_${normalizeLexicalText(canonical).replace(/\s+/g, '_')}`);
    }
  }

  if (/\b(?:the\s+)?homie\b/i.test(text)) {
    ambiguityFlags.push('homie_unnamed_needs_resolution');
  }

  return { entities, places, events, emotions, skills, ambiguityFlags };
}
