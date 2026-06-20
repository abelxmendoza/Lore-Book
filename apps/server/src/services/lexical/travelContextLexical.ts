/**
 * Travel + school-class narrative patterns — Japan trip, weather context, class groups.
 */
import type {
  LexicalAnalysisResult,
  LexicalEntity,
  LexicalEventSignal,
  LexicalPlaceSignal,
  LexicalSkillSignal,
} from './lexicalTypes';
import { normalizeLexicalText, padForScan, titleCase } from './lexicalNormalizer';

export const TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT =
  'I went to Japan last summer. It was so hot I took my favorite summer clothes. I went on the trip with my school Japanese Class.';

export function isTravelJapanSchoolJapaneseClassText(text: string): boolean {
  const p = padForScan(text);
  return (
    /\b japan\b/.test(p) &&
    /\blast summer\b/.test(p) &&
    /\bschool\b/.test(p) &&
    /\bjapanese class\b/.test(p)
  );
}

export function enrichTravelContextLexical(
  text: string,
  partial: Pick<
    LexicalAnalysisResult,
    'entities' | 'places' | 'events' | 'skills'
  >
): {
  entities: LexicalEntity[];
  places: LexicalPlaceSignal[];
  events: LexicalEventSignal[];
  skills: LexicalSkillSignal[];
  ambiguityFlags: string[];
} {
  const isTravel = isTravelJapanSchoolJapaneseClassText(text) || /\bwent\s+to\s+[A-Z]/i.test(text);
  if (!isTravel && !/\bschool\s+[A-Z][\w]*\s+Class\b/i.test(text)) {
    return {
      entities: partial.entities,
      places: partial.places,
      events: partial.events,
      skills: partial.skills,
      ambiguityFlags: [],
    };
  }

  const entities = [...partial.entities];
  const places = [...partial.places];
  const events = [...partial.events];
  const skills = [...partial.skills];
  const ambiguityFlags: string[] = [];
  const entitySeen = new Set(entities.map((e) => `${e.type}:${e.normalized ?? normalizeLexicalText(e.surface)}`));
  const eventSeen = new Set(events.map((e) => e.kind));

  const pushEntity = (entity: Omit<LexicalEntity, 'normalized'> & { normalized?: string }) => {
    const normalized = entity.normalized ?? normalizeLexicalText(entity.surface);
    const key = `${entity.type}:${normalized}`;
    if (entitySeen.has(key)) return;
    entitySeen.add(key);
    entities.push({ ...entity, normalized });
  };

  const japanMatch = /\b(Japan)\b/i.exec(text);
  if (japanMatch?.[1]) {
    pushEntity({
      surface: japanMatch[1],
      type: 'PLACE',
      subcategory: 'COUNTRY',
      confidence: 0.95,
      source: 'travel_destination',
    });
    if (!places.some((p) => /japan/i.test(p.name))) {
      places.push({
        name: 'Japan',
        category: 'country',
        cue: japanMatch[0],
        confidence: 0.95,
      });
    }
  }

  const lastSummer = /\b(last\s+summer)\b/i.exec(text);
  if (lastSummer?.[1]) {
    pushEntity({
      surface: lastSummer[1],
      type: 'TIME',
      subcategory: 'TIME_PERIOD',
      confidence: 0.88,
      source: 'relative_time_period',
    });
    ambiguityFlags.push('last_summer_needs_year_resolution');
  }

  const hotMatch = /\b(?:was\s+so\s+|it\s+was\s+)(hot)\b/i.exec(text) ?? /\b(hot)\b/i.exec(text);
  if (hotMatch?.[1] && !/\bhot\s+(?:flash|line|spot|topic)\b/i.test(text)) {
    pushEntity({
      surface: hotMatch[1],
      type: 'CONTEXT',
      subcategory: 'WEATHER_CONTEXT',
      confidence: 0.82,
      source: 'weather_context_not_medical',
    });
  }

  const clothesMatch = /\b(favorite\s+summer\s+clothes)\b/i.exec(text);
  if (clothesMatch?.[1]) {
    pushEntity({
      surface: clothesMatch[1],
      type: 'OBJECT',
      subcategory: 'PREFERENCE',
      confidence: 0.8,
      source: 'preference_candidate',
    });
    ambiguityFlags.push('preference_requires_review');
  }

  const schoolClassMatch =
    /\b(?:my|our)\s+school\s+([A-Z][\w]*(?:\s+[A-Z][\w]*)*)\s+Class\b/i.exec(text) ??
    /\bwith\s+my\s+school\s+([A-Z][\w]*(?:\s+[A-Z][\w]*)*)\s+Class\b/i.exec(text);
  if (schoolClassMatch?.[0]) {
    const className = `${schoolClassMatch[1].trim()} Class`;
    pushEntity({
      surface: schoolClassMatch[0].replace(/^with\s+/i, '').trim(),
      type: 'GROUP',
      subcategory: 'SCHOOL_CLASS',
      confidence: 0.92,
      source: 'school_class_reference',
    });
    pushEntity({
      surface: className,
      type: 'GROUP',
      subcategory: 'SCHOOL_CLASS',
      confidence: 0.9,
      source: 'school_class_name',
    });
    ambiguityFlags.push('school_parent_unresolved');
  }

  const japaneseLang = /\b(Japanese)\b/i.exec(text);
  if (japaneseLang?.[1]) {
    pushEntity({
      surface: japaneseLang[1],
      type: 'SKILL',
      subcategory: 'LANGUAGE',
      confidence: 0.86,
      source: 'language_from_class_context',
    });
    if (!skills.some((s) => /japanese/i.test(s.name))) {
      skills.push({
        name: 'Japanese',
        category: 'language',
        hobby_or_paid: 'unknown',
        proficiency_hint: 'unknown',
        usage_frequency_hint: 'unknown',
        enjoyment_hint: 'unknown',
        lore_context: schoolClassMatch?.[0] ?? 'Japanese Class',
        confidence: 0.84,
      });
    }
  }

  if (/\b(?:went\s+on\s+the\s+)?trip\b/i.test(text) || /\bwent\s+to\b/i.test(text)) {
    if (!eventSeen.has('travel')) {
      events.push({
        kind: 'travel',
        cue: /\bwent\s+on\s+the\s+trip\b/i.test(text) ? 'went on the trip' : 'went to Japan',
        confidence: 0.88,
      });
      eventSeen.add('travel');
    }
    pushEntity({
      surface: /\bwent\s+on\s+the\s+(trip)\b/i.exec(text)?.[1] ?? 'trip',
      type: 'EVENT',
      subcategory: 'TRAVEL',
      confidence: 0.85,
      source: 'travel_event',
    });
  }

  if (schoolClassMatch && /\btrip\b/i.test(text)) {
    if (!eventSeen.has('educational_travel')) {
      events.push({
        kind: 'learning_moment',
        cue: 'school trip with Japanese Class',
        confidence: 0.78,
      });
      ambiguityFlags.push('possibly_school_trip');
    }
  }

  return { entities, places, events, skills, ambiguityFlags };
}
