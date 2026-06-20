/**
 * Shared lexical preview patterns — keep in sync with apps/web/src/lib/lexicalPreviewPatterns.ts
 */
import {
  type PreviewPattern,
  validatePreviewPattern,
} from './previewPatternTypes';

export type { PreviewPattern } from './previewPatternTypes';
export {
  validatePreviewPattern,
  literalPhrases,
  matchPreviewPattern,
  patternConfidence,
  patternNeedsReview,
  hasWordBoundary,
} from './previewPatternTypes';

function L(p: PreviewPattern): PreviewPattern {
  validatePreviewPattern(p);
  return p;
}

export const PREVIEW_PATTERNS: PreviewPattern[] = [
  // ── Workplace / professional ───────────────────────────────────────────────
  L({
    id: 'deployment_at_place_in_city',
    regex: /\bat\s+[A-Z][\w']*(?:'s)?\s+in\s+[A-Z][a-z]+\b/g,
    type: 'DEPLOYMENT_SITE',
    subtype: 'WORKSITE',
    colorKey: 'worksite',
    confidenceBase: 0.86,
    requiresReview: true,
    priority: 35,
  }),
  L({
    id: 'employer_worked_at',
    regex: /\b(?<=worked\s+at\s)[A-Z][\w]*(?:\s+[A-Z][\w]*)+\b/g,
    type: 'ORGANIZATION',
    subtype: 'EMPLOYER',
    colorKey: 'organization',
    confidenceBase: 0.92,
    priority: 34,
    contextRules: ['employer_worked_at'],
  }),
  L({
    id: 'role_as_a',
    regex: /\b(?<=as\s+a\s)[a-z][\w\s-]+?(?=\s+with|\s*[,.]|$|\s+at\b|\s+for\b)/gi,
    type: 'ROLE',
    subtype: 'JOB_TITLE',
    colorKey: 'role',
    confidenceBase: 0.88,
    requiresReview: true,
    priority: 33,
  }),
  L({ id: 'skill_aruco_calibration', literal: 'ArUco calibration', type: 'SKILL', subtype: 'PROFESSIONAL_SKILL', colorKey: 'skill', confidenceBase: 0.88, priority: 32 }),
  L({ id: 'work_live_robot_support', literal: 'live robot support', type: 'WORK_ACTIVITY', subtype: 'FIELD_OPERATIONS', colorKey: 'work_activity', confidenceBase: 0.84, priority: 31 }),
  L({ id: 'task_gripper_swap', literal: 'gripper swap', literalVariants: ['gripper swaps'], type: 'TASK', subtype: 'MAINTENANCE_TASK', colorKey: 'task', confidenceBase: 0.82, requiresReview: true, priority: 30 }),
  L({ id: 'person_coworker_with', regex: /\b(?<=with\s)[A-Z][a-z]+(?=\s+and\b)/g, type: 'PERSON', subtype: 'COWORKER', colorKey: 'person', confidenceBase: 0.85, priority: 29 }),
  L({ id: 'person_coworker_and', regex: /\b(?<=and\s)[A-Z][a-z]+(?=\s*[,.]|$|\s+(?:I|at)\b)/g, type: 'PERSON', subtype: 'COWORKER', colorKey: 'person', confidenceBase: 0.85, priority: 28 }),
  L({ id: 'place_city_in', regex: /\b(?<=in\s)[A-Z][a-z]+(?=\s*[,.]|$)/g, type: 'PLACE', subtype: 'CITY', colorKey: 'place', confidenceBase: 0.84, priority: 27 }),
  L({ id: 'role_robot_tech', literal: 'robot tech', type: 'ROLE', subtype: 'JOB_TITLE', colorKey: 'role', confidenceBase: 0.9, priority: 38 }),
  L({ id: 'person_gary', literal: 'Gary', type: 'PERSON', subtype: 'COWORKER', colorKey: 'person', confidenceBase: 0.88, caseSensitive: true, priority: 37 }),
  L({ id: 'work_context_old_job', literal: 'old job', type: 'WORK_CONTEXT', subtype: 'PAST_EMPLOYMENT', colorKey: 'organization', confidenceBase: 0.84, requiresReview: true, priority: 36, contextRules: ['past_employment_old_job'] }),
  L({ id: 'skill_muay_thai', literal: 'Muay Thai', type: 'SKILL', subtype: 'MARTIAL_ART', colorKey: 'skill', confidenceBase: 0.88, priority: 34 }),
  L({ id: 'skill_boxing', literal: 'boxing', type: 'SKILL', subtype: 'MARTIAL_ART', colorKey: 'skill', confidenceBase: 0.84, priority: 33 }),
  L({ id: 'emotion_heated', literal: 'heated', type: 'EMOTION', subtype: 'ANGER', colorKey: 'emotional_significance', confidenceBase: 0.82, requiresReview: true, priority: 32 }),
  L({ id: 'conflict_swung_on_him', literal: 'swung on him', type: 'CONFLICT', subtype: 'THREAT_EVENT', colorKey: 'event', confidenceBase: 0.86, requiresReview: true, priority: 31, contextRules: ['conflict_threat_review_first'] }),
  L({ id: 'time_last_night', literal: 'last night', type: 'TIME_PERIOD', subtype: 'RELATIVE', colorKey: 'time', confidenceBase: 0.88, requiresReview: true, priority: 30 }),
  L({ id: 'event_show', literal: 'show', type: 'EVENT', subtype: 'EVENT_OR_VENUE', colorKey: 'event', confidenceBase: 0.78, requiresReview: true, priority: 29 }),
  L({ id: 'org_armstrong', literal: 'Armstrong', type: 'ORGANIZATION', subtype: 'WORKPLACE', colorKey: 'organization', confidenceBase: 0.82, requiresReview: true, priority: 28, contextRules: ['workplace_armstrong_context'] }),

  // ── Friendship / music scene ───────────────────────────────────────────────
  L({ id: 'emotion_never_had_friends', literal: 'never had friends like him', literalVariants: ['never had any other friends like him'], type: 'EMOTIONAL_SIGNIFICANCE', subtype: 'IRREPLACEABILITY', colorKey: 'emotional_significance', confidenceBase: 0.93, requiresReview: true, priority: 24 }),
  L({ id: 'relationship_best_friend', literal: 'best friend', type: 'RELATIONSHIP', subtype: 'CLOSE_FRIEND', colorKey: 'relationship', confidenceBase: 0.92, requiresReview: true, priority: 23, contextRules: ['relationship_best_friend'] }),
  L({ id: 'time_before_pandemic', literal: 'before the Pandemic', type: 'TIME_PERIOD', subtype: 'HISTORICAL_MARKER', colorKey: 'time', confidenceBase: 0.9, requiresReview: true, priority: 22 }),
  L({ id: 'time_before_covid', literal: 'before covid', literalVariants: ['before COVID', 'before Covid'], type: 'TIME_PERIOD', subtype: 'FUZZY_TIME_PERIOD', colorKey: 'time', confidenceBase: 0.88, requiresReview: true, priority: 22, contextRules: ['fuzzy_time_before_covid'] }),
  L({ id: 'event_shows_in_la', regex: /\b(?:used to )?go to shows in LA(?:\s+all the time)?\b/gi, type: 'EVENT', subtype: 'RECURRING_EVENT', colorKey: 'event', confidenceBase: 0.91, priority: 21 }),
  L({ id: 'event_code_red', literal: 'Code Red', type: 'EVENT', subtype: 'EVENT_OR_VENUE', colorKey: 'event', confidenceBase: 0.92, requiresReview: true, caseSensitive: true, priority: 36 }),
  L({ id: 'music_ska_shows', literal: 'ska show', literalVariants: ['ska shows', 'a bunch of ska shows'], type: 'MUSIC_GENRE', subtype: 'SKA', colorKey: 'interest', confidenceBase: 0.88, priority: 19 }),
  L({ id: 'community_la_ska_scene', literal: 'LA ska scene', type: 'COMMUNITY', subtype: 'MUSIC_SCENE', colorKey: 'group', confidenceBase: 0.86, requiresReview: true, priority: 20, contextRules: ['music_scene_la_ska'] }),

  // ── School / community ─────────────────────────────────────────────────────
  L({ id: 'person_full_name', regex: /\b[A-Z][a-z]+(?:\s+(?!Class\b|Team\b|Club\b|Break\b|Street\b|Avenue\b|Road\b|Boulevard\b|Red\b)[A-Z][a-z]+)+\b/g, type: 'PERSON', subtype: 'FULL_NAME', colorKey: 'person', confidenceBase: 0.9, priority: 17 }),
  L({ id: 'group_friends_from_team', regex: /\b(?:my\s+|our\s+)?friends?\s+(?:from|on|in)\s+(?:the\s+|my\s+|our\s+)?[a-z]+\s+team\b/gi, type: 'GROUP', subtype: 'SOCIAL_GROUP', colorKey: 'group', confidenceBase: 0.82, requiresReview: true, priority: 16, contextRules: ['friend_group_from_team'] }),
  L({ id: 'school_club_at_school', regex: /\b[a-z]+\s+club\s+at\s+school\b/gi, type: 'GROUP', subtype: 'SCHOOL_CLUB', colorKey: 'group', confidenceBase: 0.88, requiresReview: true, priority: 15, contextRules: ['school_club_at_school'] }),
  L({ id: 'event_detention', literal: 'detention', type: 'EVENT', subtype: 'SCHOOL_DISCIPLINE_EVENT', colorKey: 'event', confidenceBase: 0.85, requiresReview: true, priority: 14 }),
  L({ id: 'time_lunch_break', literal: 'lunch break', type: 'TIME_PERIOD', subtype: 'SCHOOL_DAY_TIME', colorKey: 'time', confidenceBase: 0.85, priority: 13 }),
  L({ id: 'time_lunch', literal: 'lunch', type: 'TIME_PERIOD', subtype: 'SCHOOL_DAY_TIME', colorKey: 'time', confidenceBase: 0.82, priority: 13, contextRules: ['school_day_lunch'] }),
  L({ id: 'time_yesterday', literal: 'yesterday', type: 'TIME_PERIOD', subtype: 'RELATIVE_DATE', colorKey: 'time', confidenceBase: 0.9, priority: 12 }),
  L({ id: 'school_team_sports', regex: /\b(?:football|soccer|basketball|baseball|track|swim|debate|chess)\s+team\b/gi, type: 'GROUP', subtype: 'SCHOOL_TEAM', colorKey: 'group', confidenceBase: 0.8, priority: 11, contextRules: ['school_team_sport'] }),
  L({ id: 'person_jenny', literal: 'Jenny', type: 'PERSON', subtype: 'FULL_NAME', colorKey: 'person', confidenceBase: 0.86, caseSensitive: true, priority: 26 }),
  L({ id: 'school_club_anime', literal: 'anime club', type: 'SCHOOL_CLUB', subtype: 'SCHOOL_CLUB', colorKey: 'group', confidenceBase: 0.88, requiresReview: true, priority: 25, contextRules: ['school_club_from_phrase'] }),
  L({ id: 'group_robotics_kids', literal: 'robotics kids', type: 'FRIEND_GROUP', subtype: 'SCHOOL_GROUP', colorKey: 'group', confidenceBase: 0.84, requiresReview: true, priority: 24, contextRules: ['school_group_robotics_kids'] }),
  L({ id: 'place_gym', literal: 'gym', type: 'PLACE', subtype: 'SCHOOL_PLACE', colorKey: 'place', confidenceBase: 0.8, requiresReview: true, priority: 23, contextRules: ['school_place_gym'] }),

  // ── Travel / preferences ───────────────────────────────────────────────────
  L({ id: 'preference_favorite_summer_clothes', literal: 'favorite summer clothes', type: 'PREFERENCE', subtype: 'OBJECT_CATEGORY', colorKey: 'preference', confidenceBase: 0.8, requiresReview: true, priority: 10 }),
  L({ id: 'preference_black_summer_shirts', literal: 'black summer shirts', type: 'PREFERENCE', subtype: 'CLOTHING', colorKey: 'preference', confidenceBase: 0.82, requiresReview: true, priority: 10 }),
  L({ id: 'school_class_regex', regex: /\b(?:my|our)\s+school\s+[A-Z][\w]*(?:\s+[A-Z][\w]*)*\s+Class\b/gi, type: 'GROUP', subtype: 'SCHOOL_CLASS', colorKey: 'group', confidenceBase: 0.92, priority: 9 }),
  L({ id: 'time_last_summer', literal: 'last summer', type: 'TIME_PERIOD', subtype: 'RELATIVE', colorKey: 'time', confidenceBase: 0.88, requiresReview: true, priority: 8, contextRules: ['fuzzy_time_last_summer'] }),
  L({ id: 'place_japan', literal: 'Japan', type: 'PLACE', subtype: 'country', colorKey: 'place', confidenceBase: 0.95, caseSensitive: true, priority: 7 }),
  L({ id: 'place_la', literal: 'LA', type: 'PLACE', subtype: 'city_or_region', colorKey: 'place', confidenceBase: 0.9, caseSensitive: true, priority: 6 }),
  L({ id: 'weather_hot', regex: /\b(?:was\s+so\s+|it\s+was\s+)hot\b/gi, type: 'WEATHER_CONTEXT', subtype: 'CLIMATE', colorKey: 'weather', confidenceBase: 0.82, priority: 5 }),
  L({ id: 'weather_hot_as_hell', literal: 'hot as hell', type: 'WEATHER_CONTEXT', subtype: 'HEAT', colorKey: 'weather', confidenceBase: 0.84, priority: 5 }),
  L({ id: 'event_went_on_trip', literal: 'went on the trip', type: 'EVENT', subtype: 'EVENT_TRAVEL', colorKey: 'event', confidenceBase: 0.85, priority: 4 }),
  L({ id: 'event_trip', literal: 'trip', type: 'EVENT', subtype: 'EVENT_TRAVEL', colorKey: 'event', confidenceBase: 0.78, priority: 3 }),
  L({ id: 'language_japanese', literal: 'Japanese', type: 'LANGUAGE', subtype: 'SUBJECT', colorKey: 'language', confidenceBase: 0.86, caseSensitive: true, priority: 2 }),
  L({ id: 'travel_went_to_japan', literal: 'went to Japan', type: 'EVENT', subtype: 'TRAVEL_EVENT', colorKey: 'event', confidenceBase: 0.87, priority: 22 }),
  L({ id: 'school_japanese_class', literal: 'Japanese class', literalVariants: ['Japanese Class', 'school Japanese Class'], type: 'GROUP', subtype: 'SCHOOL_CLASS', colorKey: 'group', confidenceBase: 0.9, requiresReview: true, priority: 21, contextRules: ['school_class_japanese'] }),

  // ── Neighborhood / misc literals ───────────────────────────────────────────
  L({ id: 'activity_gardening', literal: 'gardening', type: 'ACTIVITY', subtype: 'OUTDOOR', colorKey: 'work_activity', confidenceBase: 0.84, priority: 26, contextRules: ['activity_gardening'] }),
  L({ id: 'activity_fix_bike', regex: /\bfixing\s+(?:his|her|their)\s+bike\b/gi, type: 'ACTIVITY', subtype: 'BIKE_REPAIR', colorKey: 'work_activity', confidenceBase: 0.86, requiresReview: true, priority: 25, contextRules: ['activity_bike_repair'] }),
  L({ id: 'school_coding_club', regex: /\b(?:our|my|the)\s+(?:after\s+school\s+)?coding\s+club\b/gi, type: 'GROUP', subtype: 'SCHOOL_CLUB', colorKey: 'group', confidenceBase: 0.9, requiresReview: true, priority: 24 }),
  L({ id: 'place_wild_rivers_street', literal: 'Wild Rivers Street', type: 'PLACE', subtype: 'STREET', colorKey: 'place', confidenceBase: 0.88, priority: 23 }),
  L({ id: 'object_bike', literal: 'bike', type: 'OBJECT', subtype: 'VEHICLE', colorKey: 'uncertain', confidenceBase: 0.75, priority: 5 }),

  // ── Identity / relationship ────────────────────────────────────────────────
  L({ id: 'relationship_estranged_dad', literal: "estranged dad", type: 'RELATIONSHIP', subtype: 'FATHER', colorKey: 'relationship', confidenceBase: 0.9, requiresReview: true, priority: 27, contextRules: ['relationship_estranged_father'] }),
  L({ id: 'event_identity_collision', literal: 'mixing us up', type: 'EVENT', subtype: 'IDENTITY_COLLISION_EVENT', colorKey: 'event', confidenceBase: 0.88, requiresReview: true, priority: 26, contextRules: ['identity_collision_event'] }),
  L({ id: 'person_mike', literal: 'Mike', type: 'PERSON', subtype: 'FULL_NAME', colorKey: 'person', confidenceBase: 0.84, caseSensitive: true, priority: 25 }),
  L({ id: 'person_charlie', literal: 'Charlie', type: 'PERSON', subtype: 'FULL_NAME', colorKey: 'person', confidenceBase: 0.84, caseSensitive: true, priority: 25 }),
].sort((a, b) => b.priority - a.priority);

for (const pattern of PREVIEW_PATTERNS) {
  validatePreviewPattern(pattern);
}
