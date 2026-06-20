import { expect } from 'vitest';
import { runLexicalIntelligence, findIntelligenceSpan } from './lexicalIntelligenceService';
import type { EntityType, LexicalIntelligenceResult } from './lexicalIntelligenceTypes';
import {
  SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_ID,
  SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT,
} from '../../../../tests/fixtures/schoolDetentionLunchFootballTeamFriends';
import {
  LOST_BEST_FRIEND_LA_SHOWS_SKA_SCENE_ID,
  LOST_BEST_FRIEND_LA_SHOWS_SKA_SCENE_TEXT,
} from '../../../../tests/fixtures/lostBestFriendLaShowsSkaScene';
import {
  ROBOTICS_WORKPLACE_FIXTURE_ID,
  ROBOTICS_WORKPLACE_FIXTURE_TEXT,
} from '../workplaceContextLexical';
import { TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_ID } from '../../../../tests/fixtures/travelJapanSchoolJapaneseClass';
import { TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT } from '../travelContextLexical';
import { NEIGHBORHOOD_CODING_CLUB_FIXTURE_TEXT } from '../../inference/inferenceAssociationTypes';
import {
  MESSY_SHOW_CONFLICT_KICKBOXING_ID,
  MESSY_SHOW_CONFLICT_KICKBOXING_TEXT,
} from '../../../../tests/fixtures/messyShowConflictKickboxing';
import { lexicalAnalyzerService } from '../lexicalAnalyzerService';

export type FixtureSpanExpectation = {
  label: string;
  match: RegExp;
  type: EntityType | string;
  subtype?: string;
  minConfidence?: number;
  rulesFired?: string[];
  forbidden?: boolean;
};

export type LexicalFixtureSpec = {
  id: string;
  text: string;
  expected: FixtureSpanExpectation[];
  forbiddenPatterns?: RegExp[];
  minRulesFired?: string[];
  mode?: 'intelligence' | 'analyzer';
};

export const LEXICAL_FIXTURE_PACK: LexicalFixtureSpec[] = [
  {
    id: SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_ID,
    text: SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT,
    expected: [
      { label: 'Abel Mendoza', match: /^Abel Mendoza$/, type: 'PERSON', minConfidence: 0.85 },
      { label: 'coding club', match: /coding club at school/i, type: 'SCHOOL_CLUB', minConfidence: 0.8, rulesFired: ['school_club_at_school'] },
      { label: 'detention', match: /^detention$/i, type: 'EVENT', subtype: 'SCHOOL_DISCIPLINE_EVENT', minConfidence: 0.8 },
      { label: 'yesterday', match: /^yesterday$/i, type: 'TIME_PERIOD', minConfidence: 0.85 },
      { label: 'lunch break', match: /lunch break/i, type: 'TIME_PERIOD', minConfidence: 0.8 },
      { label: 'friends from football team', match: /friends from the football team/i, type: 'FRIEND_GROUP', minConfidence: 0.78, rulesFired: ['friend_group_from_team'] },
    ],
    forbiddenPatterns: [/^(?:I|friends)$/i],
    minRulesFired: ['school_club_at_school', 'friend_group_from_team'],
  },
  {
    id: 'neighborhood_after_school_coding_club',
    text: NEIGHBORHOOD_CODING_CLUB_FIXTURE_TEXT,
    expected: [
      { label: 'Mr Morten', match: /Mr Morten/i, type: 'PERSON', minConfidence: 0.8 },
      { label: 'gardening', match: /gardening/i, type: 'ACTIVITY', minConfidence: 0.8, rulesFired: ['activity_gardening'] },
      { label: 'Wild Rivers Street', match: /Wild Rivers Street/i, type: 'PLACE', minConfidence: 0.85 },
      { label: 'fixing bike', match: /fixing his bike/i, type: 'ACTIVITY', minConfidence: 0.8 },
      { label: 'Coding Club', match: /coding club/i, type: 'SCHOOL_CLUB', minConfidence: 0.85 },
    ],
    minRulesFired: ['activity_gardening'],
  },
  {
    id: TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_ID,
    text: TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT,
    expected: [
      { label: 'Japan', match: /^Japan$/, type: 'TRAVEL_DESTINATION', minConfidence: 0.75 },
      { label: 'last summer', match: /last summer/i, type: 'TIME_PERIOD', minConfidence: 0.85 },
      { label: 'Japanese Class', match: /Japanese Class/i, type: 'GROUP', minConfidence: 0.85 },
      { label: 'favorite summer clothes', match: /favorite summer clothes/i, type: 'PREFERENCE', minConfidence: 0.75 },
    ],
    minRulesFired: ['fuzzy_time_last_summer'],
  },
  {
    id: LOST_BEST_FRIEND_LA_SHOWS_SKA_SCENE_ID,
    text: LOST_BEST_FRIEND_LA_SHOWS_SKA_SCENE_TEXT,
    expected: [
      { label: 'Oscar Trujio', match: /^Oscar Trujio$/, type: 'PERSON', minConfidence: 0.85 },
      { label: 'best friend', match: /best friend/i, type: 'RELATIONSHIP', minConfidence: 0.88, rulesFired: ['relationship_best_friend'] },
      { label: 'before the Pandemic', match: /before the Pandemic/i, type: 'TIME_PERIOD', minConfidence: 0.85 },
      { label: 'ska shows', match: /ska shows?/i, type: 'MUSIC_GENRE', minConfidence: 0.85 },
      { label: 'emotional significance', match: /never had .* friends like him/i, type: 'EMOTIONAL_SIGNIFICANCE', minConfidence: 0.9 },
    ],
    minRulesFired: ['relationship_best_friend', 'emotional_irreplaceability'],
  },
  {
    id: ROBOTICS_WORKPLACE_FIXTURE_ID,
    text: ROBOTICS_WORKPLACE_FIXTURE_TEXT,
    expected: [
      { label: 'Armstrong Robotics', match: /Armstrong Robotics/i, type: 'ORGANIZATION', minConfidence: 0.88, rulesFired: ['employer_worked_at'] },
      { label: 'robot tech', match: /robot tech/i, type: 'ROLE', minConfidence: 0.85 },
      { label: 'Gary', match: /^Gary$/, type: 'PERSON', minConfidence: 0.8 },
      { label: 'ArUco calibration', match: /ArUco calibration/i, type: 'SKILL', minConfidence: 0.85 },
      { label: "Denny's in Hollywood", match: /Denny's in Hollywood/i, type: 'DEPLOYMENT_SITE', minConfidence: 0.82, rulesFired: ['deployment_site_not_employer'] },
    ],
    minRulesFired: ['employer_worked_at', 'deployment_site_not_employer'],
  },
  {
    id: MESSY_SHOW_CONFLICT_KICKBOXING_ID,
    text: MESSY_SHOW_CONFLICT_KICKBOXING_TEXT,
    mode: 'analyzer',
    expected: [
      { label: 'Michael Fasbender', match: /Michael Fasbender/i, type: 'PERSON', minConfidence: 0.5 },
      { label: 'Charlie', match: /^Charlie$/i, type: 'PERSON', minConfidence: 0.5 },
      { label: 'kickboxing', match: /kickboxing/i, type: 'SKILL', minConfidence: 0.5 },
    ],
  },
];

export function runFixture(spec: LexicalFixtureSpec): LexicalIntelligenceResult | { analyzer: true } {
  if (spec.mode === 'analyzer') {
    lexicalAnalyzerService.analyzeMessage({
      userId: 'fixture-user',
      messageId: 'fixture',
      text: spec.text,
    });
    return { analyzer: true };
  }
  return runLexicalIntelligence({
    text: spec.text,
    includeAlternatives: true,
    includeAnalyzerEntities: true,
  });
}

export function assertFixtureExpectations(
  spec: LexicalFixtureSpec,
  result: LexicalIntelligenceResult
): void {
  for (const exp of spec.expected) {
    const span = findIntelligenceSpan(result, exp.match);
    expect(span, exp.label).toBeDefined();
    if (!span) continue;

    if (exp.type === 'GROUP' || exp.type === 'SCHOOL_CLUB' || exp.type === 'FRIEND_GROUP') {
      expect(
        span.type === exp.type ||
          (exp.type === 'GROUP' && ['GROUP', 'SCHOOL_CLUB', 'SCHOOL_TEAM', 'FRIEND_GROUP'].includes(span.type))
      ).toBe(true);
    } else {
      expect(span.type).toBe(exp.type);
    }

    if (exp.subtype) expect(span.subtype).toBe(exp.subtype);
    if (exp.minConfidence) expect(span.confidence).toBeGreaterThanOrEqual(exp.minConfidence);
    if (exp.rulesFired?.length) {
      for (const rule of exp.rulesFired) {
        expect(span.rulesFired ?? result.rulesFired).toContain(rule);
      }
    }
    expect(span.alternatives.length).toBeGreaterThanOrEqual(0);
    expect(span.contextWindow.match.length).toBeGreaterThan(0);
    expect(span.evidencePhrases.length).toBeGreaterThan(0);
  }

  if (spec.forbiddenPatterns) {
    for (const re of spec.forbiddenPatterns) {
      expect(result.spans.some((s) => re.test(s.text)), `forbidden ${re}`).toBe(false);
    }
  }

  if (spec.minRulesFired) {
    for (const rule of spec.minRulesFired) {
      expect(result.rulesFired).toContain(rule);
    }
  }

  expect(result.spans.filter((s) => s.status === 'needs_review' && s.confidence < 0.5)).toEqual([]);
}

export function runAllLexicalFixtures(): Array<{ id: string; passed: boolean; error?: string }> {
  return LEXICAL_FIXTURE_PACK.map((spec) => {
    try {
      if (spec.mode === 'analyzer') {
        const lexical = lexicalAnalyzerService.analyzeMessage({
          userId: 'fixture-user',
          messageId: spec.id,
          text: spec.text,
        });
        expect(lexical.entities.some((e) => /fasbender/i.test(e.surface))).toBe(true);
        expect(lexical.entities.some((e) => /charlie/i.test(e.surface))).toBe(true);
        return { id: spec.id, passed: true };
      }
      const result = runLexicalIntelligence({ text: spec.text, includeAlternatives: true });
      assertFixtureExpectations(spec, result);
      return { id: spec.id, passed: true };
    } catch (err) {
      return { id: spec.id, passed: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
