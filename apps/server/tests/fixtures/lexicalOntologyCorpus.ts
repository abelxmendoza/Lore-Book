/**
 * Shared "golden corpus" of annotated messages for lexical-intelligence and
 * ontology testing.
 *
 * Each case pairs an input message with the structured signals the deterministic
 * lexical analyzer is expected to produce. Expectations are intentionally
 * *loose* (substring / category / membership matchers, not deep equality) so the
 * corpus stays robust against incidental detector changes while still pinning the
 * behaviour that matters.
 *
 * This corpus is consumed by multiple test layers:
 *   - unit: `tests/services/lexicalCorpus.test.ts` (table-driven detector checks)
 *   - integration: pipeline / rescan tests replay subsets through the full flow
 *
 * To extend coverage, add a case here once — every consuming layer picks it up.
 */
import type {
  HobbyOrPaid,
  LexicalEntityType,
  LexicalIntentKind,
  LifeEventKind,
  PlaceCategory,
  ProficiencyHint,
  RelationshipRole,
} from '../../src/services/lexical/lexicalTypes';

type Valence = 'positive' | 'negative' | 'mixed' | 'neutral';

export interface ExpectedSkill {
  /** Case-insensitive substring the detected skill name must contain. */
  nameIncludes: string;
  hobby_or_paid?: HobbyOrPaid;
  proficiency_hint?: ProficiencyHint;
  enjoyment_hint?: 'low' | 'medium' | 'high' | 'unknown';
  category?: string;
}

export interface ExpectedRelationship {
  role: RelationshipRole;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'estranged';
}

export interface ExpectedPlace {
  category: PlaceCategory;
  nameIncludes?: string;
}

export interface ExpectedEmotion {
  label?: string;
  valence?: Valence;
}

export interface ExpectedEntity {
  type: LexicalEntityType;
  surfaceIncludes?: string;
}

export interface ExpectedOntologyCandidate {
  predicate?: string;
  objectIncludes?: string;
}

export interface LexicalCorpusExpectation {
  skills?: ExpectedSkill[];
  relationships?: ExpectedRelationship[];
  places?: ExpectedPlace[];
  emotions?: ExpectedEmotion[];
  events?: LifeEventKind[];
  entities?: ExpectedEntity[];
  intents?: LexicalIntentKind[];
  ontologyCandidates?: ExpectedOntologyCandidate[];
  /** result.confidence must be >= this value. */
  minConfidence?: number;
  /** Each flag must be present in result.ambiguityFlags. */
  ambiguityFlags?: string[];
  needsClarification?: boolean;
  /** Signals that must NOT be produced (anti-pollution / precision guards). */
  shouldNotProduce?: {
    entityTypes?: LexicalEntityType[];
    relationshipRoles?: RelationshipRole[];
    eventKinds?: LifeEventKind[];
  };
}

export interface LexicalCorpusCase {
  id: string;
  description: string;
  text: string;
  expect: LexicalCorpusExpectation;
  /** Optional grouping tags for filtered runs. */
  tags?: string[];
}

export const LEXICAL_ONTOLOGY_CORPUS: LexicalCorpusCase[] = [
  // ── Skills ────────────────────────────────────────────────────────────────
  {
    id: 'skills-org-improving-mainthing',
    description: 'employer + improving tech skill + "main thing" hobby in one message',
    text: "I worked at Armstrong Robotics and I'm getting better at ROS2, but Muay Thai is still my main thing.",
    tags: ['skills', 'entities', 'events', 'ontology'],
    expect: {
      skills: [
        { nameIncludes: 'ros2', proficiency_hint: 'improving', category: 'technical' },
        { nameIncludes: 'muay thai', hobby_or_paid: 'hobby', proficiency_hint: 'advanced', enjoyment_hint: 'high' },
      ],
      entities: [
        { type: 'ORGANIZATION', surfaceIncludes: 'Armstrong Robotics' },
        { type: 'SKILL', surfaceIncludes: 'ros2' },
      ],
      events: ['job_started', 'learning_moment'],
      ontologyCandidates: [
        { predicate: 'worked_for', objectIncludes: 'armstrong' },
        { predicate: 'is_learning', objectIncludes: 'ros2' },
        { predicate: 'practices', objectIncludes: 'muay thai' },
      ],
    },
  },
  {
    id: 'skills-learning-beginner',
    description: '"learning"/"studying" map to beginner proficiency',
    text: "I'm learning Python and studying machine learning on the side.",
    tags: ['skills'],
    expect: {
      skills: [{ nameIncludes: 'python', proficiency_hint: 'beginner', category: 'technical' }],
      ontologyCandidates: [{ predicate: 'is_learning', objectIncludes: 'python' }],
    },
  },
  {
    id: 'skills-paid-role',
    description: '"worked as a X" yields a paid/professional skill and a role entity',
    text: 'I worked as a software engineer for three years before switching careers.',
    tags: ['skills', 'entities'],
    expect: {
      skills: [{ nameIncludes: 'software engineer', hobby_or_paid: 'paid', category: 'professional' }],
      entities: [{ type: 'ROLE', surfaceIncludes: 'software engineer' }],
    },
  },

  // ── Relationships ───────────────────────────────────────────────────────────
  {
    id: 'rel-family-estranged-and-boss',
    description: 'estranged father + boss, with estranged sentiment and a city place',
    text: 'My estranged father still lives in Dallas and my boss is difficult.',
    tags: ['relationships', 'places'],
    expect: {
      relationships: [
        { role: 'father', sentiment: 'estranged' },
        { role: 'boss' },
      ],
      places: [{ category: 'city' }],
      emotions: [{ label: 'estrangement', valence: 'negative' }],
    },
  },
  {
    id: 'rel-romantic-breakup',
    description: 'romantic partner role plus a breakup life event',
    text: 'My girlfriend and I broke up last month.',
    tags: ['relationships', 'events'],
    expect: {
      relationships: [{ role: 'romantic_partner' }],
      events: ['breakup'],
    },
  },
  {
    id: 'rel-friend-coworker',
    description: 'close friend + coworker in the same sentence',
    text: 'My best friend introduced me to my coworker at the office.',
    tags: ['relationships'],
    expect: {
      relationships: [{ role: 'close_friend' }, { role: 'coworker' }],
      places: [{ category: 'workplace' }],
    },
  },
  {
    id: 'rel-mentor-cousin',
    description: 'mentor + cousin kinship roles',
    text: 'My mentor reminds me of my cousin in a lot of ways.',
    tags: ['relationships'],
    expect: {
      relationships: [{ role: 'mentor' }, { role: 'cousin' }],
    },
  },

  // ── Places ──────────────────────────────────────────────────────────────────
  {
    id: 'places-gym-bar-downtown',
    description: 'gym + bar + downtown city categories',
    text: 'We met at the gym and then went to a bar downtown.',
    tags: ['places'],
    expect: {
      places: [{ category: 'gym' }, { category: 'bar' }, { category: 'city' }],
    },
  },
  {
    id: 'places-home',
    description: 'home cue detection',
    text: 'I stayed at home all weekend and just relaxed.',
    tags: ['places', 'emotions'],
    expect: {
      places: [{ category: 'home' }],
    },
  },

  // ── Emotions (incl. negation) ────────────────────────────────────────────────
  {
    id: 'emotion-negative-mixed',
    description: 'two negative emotions trigger mixed_emotional_tone flag',
    text: "I'm so angry and frustrated about everything right now.",
    tags: ['emotions'],
    expect: {
      emotions: [
        { label: 'anger', valence: 'negative' },
        { label: 'frustration', valence: 'negative' },
      ],
      ambiguityFlags: ['mixed_emotional_tone'],
    },
  },
  {
    id: 'emotion-positive',
    description: 'positive joy emotion',
    text: "I'm so happy and grateful today!",
    tags: ['emotions'],
    expect: {
      emotions: [{ label: 'joy', valence: 'positive' }],
    },
  },
  {
    id: 'emotion-negated-flips-valence',
    description: 'negation flips a positive emotion alias to negative',
    text: "I'm not happy about how this turned out.",
    tags: ['emotions', 'negation'],
    expect: {
      emotions: [{ label: 'joy', valence: 'negative' }],
    },
  },

  // ── Life events ──────────────────────────────────────────────────────────────
  {
    id: 'event-promotion',
    description: 'promotion event detection',
    text: 'I just got promoted at work and I cannot believe it.',
    tags: ['events'],
    expect: {
      events: ['promotion'],
    },
  },
  {
    id: 'event-project-milestone',
    description: 'shipped/launched maps to project milestone',
    text: 'We finally shipped the new feature after months of work.',
    tags: ['events'],
    expect: {
      events: ['project_milestone'],
    },
  },

  // ── Identity / intents / ambiguity ───────────────────────────────────────────
  {
    id: 'identity-claim',
    description: 'an "X is actually me" identity claim',
    text: 'Abel Mendoza is actually me.',
    tags: ['identity', 'intents'],
    expect: {
      entities: [{ type: 'IDENTITY_CLAIM', surfaceIncludes: 'Abel Mendoza' }],
      intents: ['IDENTITY_CLAIM'],
    },
  },
  {
    id: 'disambiguation-same-name-multiple-roles',
    description: 'same name claimed as self and as a relative needs clarification',
    text: "Abel Mendoza is actually me but it's also my estranged father.",
    tags: ['identity', 'ambiguity'],
    expect: {
      ambiguityFlags: ['same_name_multiple_roles'],
      needsClarification: true,
    },
  },
  {
    id: 'query-recall-mentor',
    description: 'recall-style question referencing a mentor',
    text: 'What did I say about my mentor last week?',
    tags: ['intents', 'relationships'],
    expect: {
      relationships: [{ role: 'mentor' }],
      intents: ['RECALL'],
    },
  },
  {
    id: 'sparse-no-signals',
    description: 'low-signal acknowledgement yields sparse_signals flag + low confidence',
    text: 'ok sure thanks',
    tags: ['ambiguity'],
    expect: {
      ambiguityFlags: ['sparse_signals'],
    },
  },
];

/** Convenience: fetch a single case by id (throws if missing). */
export function getCorpusCase(id: string): LexicalCorpusCase {
  const found = LEXICAL_ONTOLOGY_CORPUS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown lexical corpus case: ${id}`);
  return found;
}

/** Convenience: all cases carrying a given tag. */
export function corpusByTag(tag: string): LexicalCorpusCase[] {
  return LEXICAL_ONTOLOGY_CORPUS.filter((c) => c.tags?.includes(tag));
}
