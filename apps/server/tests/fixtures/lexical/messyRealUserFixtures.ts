import type { LexicalFixtureSpec } from '../../../src/services/lexical/intelligence/lexicalFixtureRunner';

export const WORKPLACE_SOCIAL_CONFLICT_MARTIAL_ARTS_ID = 'workplace_social_conflict_martial_arts';
export const WORKPLACE_SOCIAL_CONFLICT_MARTIAL_ARTS_TEXT =
  "Mike from my old job at Vanguard was talking crazy at the show last night and Charlie almost swung on him. " +
  "I stayed calm because I've been training Muay Thai and boxing but I still felt heated.";

export const FAMILY_IDENTITY_COLLISION_ID = 'family_identity_collision';
export const FAMILY_IDENTITY_COLLISION_TEXT =
  "Abel Mendoza is me but it's also my estranged dad's name and people keep mixing us up.";

export const SCHOOL_GROUP_LUNCH_SOCIAL_ID = 'school_group_lunch_social';
export const SCHOOL_GROUP_LUNCH_SOCIAL_TEXT =
  "Jenny from anime club wasn't at lunch yesterday so I sat with the robotics kids near the gym.";

export const TRAVEL_LANGUAGE_PREFERENCE_ID = 'travel_language_preference';
export const TRAVEL_LANGUAGE_PREFERENCE_TEXT =
  'I went to Japan last summer with my Japanese class and packed my black summer shirts because it was hot as hell.';

export const MUSIC_SCENE_LOST_FRIEND_ID = 'music_scene_lost_friend';
export const MUSIC_SCENE_LOST_FRIEND_TEXT =
  "Oscar Trujio used to be my best friend from the LA ska scene but I haven't seen him since before covid.";

export const MESSY_REAL_USER_FIXTURES: LexicalFixtureSpec[] = [
  {
    id: WORKPLACE_SOCIAL_CONFLICT_MARTIAL_ARTS_ID,
    text: WORKPLACE_SOCIAL_CONFLICT_MARTIAL_ARTS_TEXT,
    expected: [
      { label: 'Mike', match: /^Mike$/, type: 'PERSON', minConfidence: 0.75 },
      {
        label: 'Vanguard',
        match: /^Vanguard$/,
        type: 'ORGANIZATION',
        subtype: 'WORKPLACE',
        minConfidence: 0.78,
        rulesFired: ['workplace_vanguard_context'],
      },
      {
        label: 'old job',
        match: /old job/i,
        type: 'WORK_CONTEXT',
        subtype: 'PAST_EMPLOYMENT',
        minConfidence: 0.75,
        rulesFired: ['past_employment_old_job'],
      },
      { label: 'show', match: /^show$/i, type: 'EVENT', minConfidence: 0.7 },
      { label: 'last night', match: /last night/i, type: 'TIME_PERIOD', minConfidence: 0.8 },
      { label: 'Charlie', match: /^Charlie$/, type: 'PERSON', minConfidence: 0.75 },
      {
        label: 'swung on him',
        match: /swung on him/i,
        type: 'CONFLICT',
        subtype: 'THREAT_EVENT',
        minConfidence: 0.78,
        requiresReview: true,
        rulesFired: ['conflict_threat_review_first'],
      },
      { label: 'Muay Thai', match: /Muay Thai/i, type: 'SKILL', subtype: 'MARTIAL_ART', minConfidence: 0.82 },
      { label: 'boxing', match: /^boxing$/i, type: 'SKILL', subtype: 'MARTIAL_ART', minConfidence: 0.8 },
      {
        label: 'heated',
        match: /^heated$/i,
        type: 'EMOTION',
        subtype: 'ANGER',
        minConfidence: 0.75,
      },
    ],
    forbiddenPatterns: [/^manager$/i, /^assault$/i, /^Mike from$/i],
    minRulesFired: ['past_employment_old_job', 'conflict_threat_review_first'],
  },
  {
    id: FAMILY_IDENTITY_COLLISION_ID,
    text: FAMILY_IDENTITY_COLLISION_TEXT,
    expected: [
      {
        label: 'Abel Mendoza',
        match: /^Abel Mendoza$/,
        type: 'PERSON',
        subtype: 'SELF_NAME_CANDIDATE',
        minConfidence: 0.85,
        requiresReview: true,
        rulesFired: ['identity_self_name_candidate'],
      },
      {
        label: 'estranged dad',
        match: /estranged dad/i,
        type: 'RELATIONSHIP',
        subtype: 'FATHER',
        minConfidence: 0.85,
        requiresReview: true,
        rulesFired: ['relationship_estranged_father'],
      },
      {
        label: 'mixing us up',
        match: /mixing us up/i,
        type: 'EVENT',
        subtype: 'IDENTITY_COLLISION_EVENT',
        minConfidence: 0.82,
        requiresReview: true,
        rulesFired: ['identity_collision_event'],
      },
    ],
    forbiddenPatterns: [/^me$/i],
    minRulesFired: ['identity_collision_event', 'identity_self_name_candidate'],
  },
  {
    id: SCHOOL_GROUP_LUNCH_SOCIAL_ID,
    text: SCHOOL_GROUP_LUNCH_SOCIAL_TEXT,
    expected: [
      { label: 'Jenny', match: /^Jenny$/, type: 'PERSON', minConfidence: 0.8 },
      {
        label: 'anime club',
        match: /anime club/i,
        type: 'SCHOOL_CLUB',
        minConfidence: 0.82,
        rulesFired: ['school_club_from_phrase'],
      },
      {
        label: 'lunch',
        match: /^lunch$/i,
        type: 'TIME_PERIOD',
        subtype: 'SCHOOL_DAY_TIME',
        minConfidence: 0.78,
        rulesFired: ['school_day_lunch'],
      },
      { label: 'yesterday', match: /^yesterday$/i, type: 'TIME_PERIOD', subtype: 'RELATIVE_DATE', minConfidence: 0.85 },
      {
        label: 'robotics kids',
        match: /robotics kids/i,
        type: 'FRIEND_GROUP',
        minConfidence: 0.78,
        rulesFired: ['school_group_robotics_kids'],
      },
      {
        label: 'gym',
        match: /^gym$/i,
        type: 'PLACE',
        subtype: 'SCHOOL_PLACE',
        minConfidence: 0.78,
        rulesFired: ['school_place_gym'],
      },
    ],
    forbiddenPatterns: [/^robotics$/i, /^kids$/i],
    minRulesFired: ['school_club_from_phrase', 'school_group_robotics_kids'],
  },
  {
    id: TRAVEL_LANGUAGE_PREFERENCE_ID,
    text: TRAVEL_LANGUAGE_PREFERENCE_TEXT,
    expected: [
      { label: 'Japan', match: /^Japan$/, type: 'TRAVEL_DESTINATION', minConfidence: 0.75, rulesFired: ['travel_destination_japan'] },
      { label: 'last summer', match: /last summer/i, type: 'TIME_PERIOD', minConfidence: 0.85, requiresReview: true },
      {
        label: 'Japanese class',
        match: /Japanese class/i,
        type: 'GROUP',
        subtype: 'SCHOOL_CLASS',
        minConfidence: 0.82,
        requiresReview: true,
        rulesFired: ['school_class_japanese'],
      },
      {
        label: 'black summer shirts',
        match: /black summer shirts/i,
        type: 'PREFERENCE',
        subtype: 'CLOTHING',
        minConfidence: 0.78,
      },
      {
        label: 'hot as hell',
        match: /hot as hell/i,
        type: 'WEATHER_CONTEXT',
        subtype: 'HEAT',
        minConfidence: 0.8,
      },
    ],
    forbiddenPatterns: [/^\d{4}-\d{2}-\d{2}$/],
    minRulesFired: ['fuzzy_time_last_summer', 'travel_destination_japan'],
  },
  {
    id: MUSIC_SCENE_LOST_FRIEND_ID,
    text: MUSIC_SCENE_LOST_FRIEND_TEXT,
    expected: [
      { label: 'Oscar Trujio', match: /^Oscar Trujio$/, type: 'PERSON', minConfidence: 0.85 },
      {
        label: 'best friend',
        match: /best friend/i,
        type: 'RELATIONSHIP',
        subtype: 'CLOSE_FRIEND',
        minConfidence: 0.85,
        requiresReview: true,
        rulesFired: ['relationship_best_friend', 'relationship_past_dormant'],
      },
      {
        label: 'LA ska scene',
        match: /LA ska scene/i,
        type: 'COMMUNITY',
        subtype: 'MUSIC_SCENE',
        minConfidence: 0.82,
        rulesFired: ['music_scene_la_ska'],
      },
      {
        label: 'before covid',
        match: /before covid/i,
        type: 'TIME_PERIOD',
        subtype: 'FUZZY_TIME_PERIOD',
        minConfidence: 0.82,
        requiresReview: true,
        rulesFired: ['fuzzy_time_before_covid'],
      },
    ],
    forbiddenPatterns: [/death/i, /died/i, /killed/i],
    minRulesFired: ['relationship_past_dormant', 'music_scene_la_ska'],
  },
];
