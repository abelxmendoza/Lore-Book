/**
 * Composer preview — read-only lexical span extraction for live typing.
 * No DB writes, no MRQ, no ontology mutations.
 */
import type { LexicalEntity } from './lexicalTypes';
import { loadHistoryContext } from '../inference/historyAssociationService';
import { inferTravelClassAssociations } from '../inference/travelClassInferenceService';
import { extractSchoolClassName } from '../inference/travelClassInferenceService';
import {
  inferSchoolCommunityAssociations,
  type SchoolCommunityGroup,
} from '../inference/schoolCommunityInferenceService';
import { inferFriendshipMusicSceneAssociations } from '../inference/friendshipMusicSceneInferenceService';
import { inferWorkplaceAssociations } from '../inference/work/workplaceInferenceService';
import { markKnownPreviewSpans } from './markKnownPreviewSpans';
import {
  runLexicalIntelligence,
  intelligenceSpanToPreview,
} from './intelligence/lexicalIntelligenceService';
import { classifyEntity } from '../entities/entityClassifier';

export type LexicalPreviewSpan = {
  text: string;
  start: number;
  end: number;
  type: string;
  subtype?: string;
  colorKey: string;
  confidence: number;
  temporary: true;
  needsReview?: boolean;
  inferredAssociations?: string[];
  parentContext?: string;
  /** Whether this entity already exists in the user's LoreBook index. */
  entityStatus?: 'known' | 'new';
  matchedEntityId?: string;
  matchedEntityName?: string;
};

export type LexicalPreviewAssociation = {
  kind: string;
  label: string;
  confidence: number;
  inferredNotConfirmed: true;
};

export type LexicalPreviewResult = {
  spans: LexicalPreviewSpan[];
  inferredAssociations: LexicalPreviewAssociation[];
  ambiguities: string[];
};


function filterNoiseSpans(spans: LexicalPreviewSpan[]): LexicalPreviewSpan[] {
  const pronouns = /^(?:I|we|you|he|she|they|it|me|him|her|us|them|my|our|your)$/i;
  const filtered = spans.filter((s) => {
    if (pronouns.test(s.text.trim())) return false;
    if (s.colorKey === 'uncertain' && s.text.trim().length <= 3) return false;
    return true;
  });

  // Drop PERSON spans that overlap an ORGANIZATION (e.g. "Vanguard Robotics").
  const orgSpans = filtered.filter((s) => s.type === 'ORGANIZATION');
  return filtered.filter((s) => {
    if (s.type !== 'PERSON') return true;
    return !orgSpans.some((o) => s.start < o.end && s.end > o.start);
  });
}

// EntityClass (from the ingestion classifier) → composer preview type + colorKey.
// Used to rescue proper nouns the lightweight analyzer leaves as OBJECT/uncertain
// — without this they fall through the frontend's `?? 'person'` default and every
// place/org/group shows up as a person chip.
const CLASS_TO_PREVIEW: Record<string, { type: string; colorKey: string }> = {
  PERSON: { type: 'PERSON', colorKey: 'person' },
  FAMILY: { type: 'PERSON', colorKey: 'person' },
  PLACE: { type: 'PLACE', colorKey: 'place' },
  LOCATION: { type: 'PLACE', colorKey: 'place' },
  HOUSEHOLD: { type: 'PLACE', colorKey: 'place' },
  ORGANIZATION: { type: 'ORGANIZATION', colorKey: 'organization' },
  BRAND: { type: 'ORGANIZATION', colorKey: 'organization' },
  APP: { type: 'ORGANIZATION', colorKey: 'organization' },
  GROUP: { type: 'GROUP', colorKey: 'group' },
  EVENT: { type: 'EVENT', colorKey: 'event' },
  SKILL: { type: 'SKILL', colorKey: 'skill' },
};

/**
 * Re-type proper-noun spans the analyzer left untyped (OBJECT/PROPER_NOUN →
 * colorKey "uncertain") using the contextual entity classifier. Place/org/group
 * proper nouns get correct chips; genuinely ambiguous spans (e.g. a bare first
 * name with no evidence) are left as-is so they keep the person default.
 */
export function upgradeProperNounSpans(text: string, spans: LexicalPreviewSpan[]): LexicalPreviewSpan[] {
  return spans.map((span) => {
    const untyped =
      span.colorKey === 'uncertain' ||
      (span.type === 'OBJECT' && (span.subtype === 'PROPER_NOUN' || !span.subtype));
    if (!untyped) return span;
    const cls = classifyEntity(span.text, text);
    const mapped = CLASS_TO_PREVIEW[cls.type];
    if (!mapped || cls.confidence < 0.55) return span;
    return { ...span, type: mapped.type, colorKey: mapped.colorKey };
  });
}

function entityToColorKey(entity: LexicalEntity): string {
  if (entity.type === 'PERSON') return 'person';
  if (entity.type === 'PLACE') return 'place';
  if (entity.type === 'TIME') return 'time';
  if (entity.type === 'GROUP') return 'group';
  if (entity.type === 'SKILL') return 'language';
  if (entity.type === 'EVENT') return 'event';
  if (entity.type === 'OBJECT' && entity.subcategory === 'PREFERENCE') return 'preference';
  if (entity.type === 'CONTEXT') return 'weather';
  if (entity.type === 'RELATIONSHIP') return 'relationship';
  if (entity.type === 'ORGANIZATION') return 'organization';
  if (entity.type === 'ROLE') return 'role';
  if (entity.type === 'SKILL') return 'skill';
  if (entity.type === 'TASK') return 'task';
  if (entity.type === 'WORK_ACTIVITY') return 'work_activity';
  if (entity.type === 'DEPLOYMENT_SITE') return 'worksite';
  if (entity.type === 'TEAM') return 'team';
  if (entity.type === 'PROJECT') return 'project';
  return 'uncertain';
}

function titleCaseGroup(s: string): string {
  return s
    .trim()
    .replace(/^(?:my|our|the)\s+/i, '')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function findSpanPositions(text: string, surface: string): { start: number; end: number } | null {
  const idx = text.indexOf(surface);
  if (idx < 0) {
    const re = new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const m = re.exec(text);
    if (!m) return null;
    return { start: m.index, end: m.index + m[0].length };
  }
  return { start: idx, end: idx + surface.length };
}

function mergePreviewSpans(spans: LexicalPreviewSpan[]): LexicalPreviewSpan[] {
  const sorted = [...spans].sort((a, b) => {
    const len = b.end - b.start - (a.end - a.start);
    if (len !== 0) return len;
    return a.start - b.start;
  });
  const kept: LexicalPreviewSpan[] = [];
  for (const span of sorted) {
    // Longest-first: a shorter span fully inside an already-kept span is dropped
    // regardless of kind (the more specific phrase wins — "coding club at school"
    // subsumes a stray "club"→NIGHTCLUB, "friends from the football team" subsumes
    // "team"). This is what lets high-priority multi-word phrases override the
    // analyzer's narrower mis-detections.
    const contained = kept.some((k) => k.start <= span.start && span.end <= k.end);
    if (contained) continue;
    const overlapsSameKind = kept.some(
      (k) =>
        span.start < k.end &&
        span.end > k.start &&
        (k.colorKey === span.colorKey || k.type === span.type)
    );
    if (!overlapsSameKind) kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

function sanitizeRoleSurface(surface: string): string {
  const idx = surface.toLowerCase().indexOf(' with ');
  return idx >= 0 ? surface.slice(0, idx).trim() : surface.trim();
}

function spansFromLexicalEntities(text: string, entities: LexicalEntity[]): LexicalPreviewSpan[] {
  const spans: LexicalPreviewSpan[] = [];
  for (const entity of entities) {
    let surface = entity.surface;
    let type = entity.type;
    let subtype = entity.subcategory;

    if (type === 'ROLE') {
      surface = sanitizeRoleSurface(surface);
    }

    if (type === 'OBJECT' && subtype === 'PROPER_NOUN' && /^[A-Z][a-z]+$/.test(surface)) {
      const pos = text.indexOf(surface);
      if (pos >= 0) {
        const before = text.slice(Math.max(0, pos - 8), pos);
        if (/\b(?:with|and)\s+$/i.test(before)) {
          type = 'PERSON';
          subtype = 'COWORKER';
        } else {
          continue;
        }
      }
    }

    const pos = findSpanPositions(text, surface);
    if (!pos) continue;
    spans.push({
      text: text.slice(pos.start, pos.end),
      start: pos.start,
      end: pos.end,
      type,
      subtype,
      colorKey: entityToColorKey({ ...entity, type, subcategory: subtype }),
      confidence: entity.confidence,
      temporary: true,
      needsReview: subtype === 'PREFERENCE' || entity.type === 'TIME' || type === 'ROLE',
    });
  }
  return spans;
}

export async function previewLexicalSpans(input: {
  text: string;
  userId: string;
  threadId?: string;
  mode?: 'composer_preview';
}): Promise<LexicalPreviewResult> {
  const { text, userId, threadId } = input;
  if (!text.trim()) {
    return { spans: [], inferredAssociations: [], ambiguities: [] };
  }

  const intelligence = runLexicalIntelligence({
    text,
    userId,
    includeAlternatives: true,
    includeAnalyzerEntities: true,
  });

  let spans: LexicalPreviewSpan[] = intelligence.spans.map(intelligenceSpanToPreview);
  spans = filterNoiseSpans(spans);
  // Type proper nouns the analyzer left as OBJECT/uncertain BEFORE downstream
  // inference (school/friendship/workplace) reads spans by PERSON/PLACE/GROUP.
  spans = upgradeProperNounSpans(text, spans);

  const history = await loadHistoryContext(userId);
  const className = extractSchoolClassName(text);
  const travelInference = inferTravelClassAssociations(text, 'preview-ephemeral', history);

  const inferredAssociations: LexicalPreviewAssociation[] = [];
  const ambiguities = [...new Set([...intelligence.warnings.map((w) => w.replace(/^ambiguity:/, ''))])];

  if (className) {
    const schoolGroup = travelInference.groups.find((g) => g.type === 'school_class');
    if (schoolGroup?.parentSchoolName) {
      for (const span of spans) {
        if (/school/i.test(span.text) && /Class/i.test(span.text)) {
          span.parentContext = `SCHOOL_PARENT_RESOLVED: ${schoolGroup.parentSchoolName}`;
          span.inferredAssociations = [
            ...(span.inferredAssociations ?? []),
            `subgroup_of → ${schoolGroup.parentSchoolName}`,
          ];
        }
      }
      inferredAssociations.push({
        kind: 'subgroup',
        label: `${className} appears to belong to ${schoolGroup.parentSchoolName}`,
        confidence: 0.85,
        inferredNotConfirmed: true,
      });
    } else if (schoolGroup?.needsSchoolResolution) {
      for (const span of spans) {
        if (/school/i.test(span.text) && /Class/i.test(span.text)) {
          span.parentContext = 'SCHOOL_PARENT_UNRESOLVED';
          span.needsReview = true;
        }
      }
      ambiguities.push('school_parent_unresolved');
    }
  }

  for (const rel of travelInference.relationships.slice(0, 6)) {
    inferredAssociations.push({
      kind: rel.relationshipType,
      label: `${rel.subjectName} → ${rel.relationshipType} → ${rel.objectName}`,
      confidence: rel.confidence,
      inferredNotConfirmed: true,
    });
  }

  for (const skill of travelInference.skills.filter((s) => s.subjectKind === 'user')) {
    inferredAssociations.push({
      kind: 'interest_candidate',
      label: `User interest_candidate: ${skill.skill}`,
      confidence: skill.confidence,
      inferredNotConfirmed: true,
    });
  }

  for (const amb of travelInference.ambiguities) {
    ambiguities.push(amb.code);
  }

  // ── School / community grouping inference ───────────────────────────────────
  // Build school groups from the detected GROUP spans and infer the community
  // hierarchy (club/team → school community; friend group → team; user associated).
  const schoolGroups: SchoolCommunityGroup[] = [];
  for (const span of spans) {
    if (span.type !== 'GROUP') continue;
    if (span.subtype === 'SCHOOL_CLUB') {
      schoolGroups.push({ name: titleCaseGroup(span.text.replace(/\s+at\s+school$/i, '')), groupType: 'school_club', evidencePhrase: span.text });
    } else if (span.subtype === 'SCHOOL_TEAM') {
      schoolGroups.push({ name: titleCaseGroup(span.text), groupType: 'school_team', evidencePhrase: span.text });
    } else if (span.subtype === 'SOCIAL_GROUP') {
      const teamMatch = span.text.match(/([a-z]+\s+team)\b/i);
      const teamName = teamMatch ? titleCaseGroup(teamMatch[1]) : undefined;
      schoolGroups.push({
        name: titleCaseGroup(span.text),
        groupType: 'social_friend_group',
        evidencePhrase: span.text,
        subgroupOfGroup: teamName,
      });
    }
  }

  if (schoolGroups.length > 0) {
    const hasSchoolContext = /\b(?:at|my|our)\s+school\b/i.test(text);
    const knownSchools = [...history.schools.values()];
    const school = inferSchoolCommunityAssociations({
      sourceMessageId: 'preview-ephemeral',
      groups: schoolGroups,
      knownSchools,
      hasSchoolContext,
    });

    for (const assoc of school.associations) {
      inferredAssociations.push({
        kind: assoc.kind,
        label: `${assoc.childName} → ${assoc.kind} → ${assoc.parentName}`,
        confidence: assoc.confidence,
        inferredNotConfirmed: true,
      });
    }
    // Tag the group spans with their resolved parent community.
    for (const span of spans) {
      if (span.type === 'GROUP' && (span.subtype === 'SCHOOL_CLUB' || span.subtype === 'SCHOOL_TEAM')) {
        span.parentContext = school.needsSchoolResolution
          ? 'SCHOOL_PARENT_UNRESOLVED'
          : `SCHOOL_PARENT_RESOLVED: ${school.schoolCommunityName}`;
        if (school.needsSchoolResolution) span.needsReview = true;
      }
    }
    ambiguities.push(...school.ambiguities);
  }

  // ── Friendship / music-scene inference (Oscar-style memories) ─────────────
  const personNames = spans.filter((s) => s.type === 'PERSON').map((s) => s.text);
  const placeNames = spans.filter((s) => s.type === 'PLACE').map((s) => s.text);
  const venueNames = spans
    .filter((s) => s.subtype === 'EVENT_OR_VENUE')
    .map((s) => s.text);
  const genreNames = spans
    .filter((s) => s.subtype === 'MUSIC_GENRE')
    .map((s) => s.text.replace(/\s+shows?$/i, '').trim());
  const relationshipSpan = spans.find((s) => s.type === 'RELATIONSHIP');
  const absenceSpan = spans.find(
    (s) => s.subtype === 'HISTORICAL_MARKER' && /pandemic/i.test(s.text)
  );

  if (personNames.length > 0 && (relationshipSpan || venueNames.length > 0 || genreNames.length > 0)) {
    const friendship = inferFriendshipMusicSceneAssociations({
      sourceMessageId: 'preview-ephemeral',
      text,
      people: personNames,
      places: placeNames,
      venues: venueNames,
      genres: genreNames.length > 0 ? genreNames : ['ska'],
      relationshipPhrase: relationshipSpan?.text,
      absenceTimeHint: absenceSpan?.text,
    });

    for (const assoc of friendship.associations) {
      inferredAssociations.push({
        kind: assoc.kind,
        label: `${assoc.subject} → ${assoc.kind} → ${assoc.object}`,
        confidence: assoc.confidence,
        inferredNotConfirmed: true,
      });
    }
    ambiguities.push(...friendship.ambiguities);
  }

  // ── Workplace / professional inference ─────────────────────────────────────
  const workplace = inferWorkplaceAssociations(text, 'preview-ephemeral', history);
  for (const assoc of workplace.relationships.slice(0, 8)) {
    inferredAssociations.push({
      kind: assoc.relationshipType,
      label: `${assoc.subjectName} → ${assoc.relationshipType} → ${assoc.objectName}`,
      confidence: assoc.confidence,
      inferredNotConfirmed: true,
    });
  }
  for (const review of workplace.memoryReviewCandidates.slice(0, 4)) {
    inferredAssociations.push({
      kind: 'workplace_memory',
      label: review,
      confidence: 0.85,
      inferredNotConfirmed: true,
    });
  }
  ambiguities.push(...workplace.ambiguities.map((a) => a.code));

  for (const span of spans) {
    if (span.type === 'ORGANIZATION' && span.subtype === 'EMPLOYER') {
      const employer = workplace.groups.find((g) => g.type === 'company');
      if (employer?.existingGroupId) {
        span.parentContext = `EMPLOYER_KNOWN: ${span.text}`;
      } else {
        span.parentContext = 'EMPLOYER_NEW';
        span.needsReview = true;
      }
    }
    if (span.type === 'DEPLOYMENT_SITE') {
      span.parentContext = workplace.groups.some((g) => g.type === 'company')
        ? `DEPLOYMENT_UNDER: ${workplace.groups.find((g) => g.type === 'company')?.name ?? 'employer'}`
        : 'DEPLOYMENT_NEEDS_EMPLOYER';
      span.needsReview = true;
      const placeMatch = span.text.match(/\bin\s+([A-Z][a-z]+)\b/);
      if (placeMatch) {
        span.inferredAssociations = [...(span.inferredAssociations ?? []), `PLACE: ${placeMatch[1]}`];
      }
    }
    if (span.type === 'ROLE') {
      span.inferredAssociations = [`role_candidate → ${span.text}`];
    }
  }

  spans = markKnownPreviewSpans(spans, history);

  // Tag recurring events with embedded place context (e.g. "shows in LA" → PLACE: LA).
  for (const span of spans) {
    if (span.subtype === 'RECURRING_EVENT' && /\bLA\b/.test(span.text)) {
      span.parentContext = 'PLACE: LA';
      span.inferredAssociations = [...(span.inferredAssociations ?? []), 'place → LA'];
    }
  }

  return {
    spans,
    inferredAssociations: inferredAssociations.slice(0, 12),
    ambiguities: [...new Set(ambiguities)],
  };
}
