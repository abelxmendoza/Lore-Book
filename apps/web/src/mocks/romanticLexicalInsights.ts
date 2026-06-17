// Demo lexical intelligence — sourced from canonical lore fixtures.

import {
  ROMANTIC_LORE_TEST_CASES,
  type RomanticLoreFilterTab,
  type RomanticLoreTestCase,
} from './romanticLoreStory';

export type MockLexicalInsight = {
  id: string;
  partnerName: string;
  relationshipType: string;
  cue: string;
  snippet: string;
  ontologyTag: string;
  confidence: number;
  storyBeat?: string;
  chapter?: number;
};

export type MockGlossaryCue = {
  cue: string;
  category: string;
  hint: string;
};

function toInsight(tc: RomanticLoreTestCase, confidence = 0.85): MockLexicalInsight {
  return {
    id: tc.id,
    partnerName: tc.expectedPartner,
    relationshipType: tc.expectedType,
    cue: tc.glossaryCue,
    snippet: tc.lexicalSnippet,
    ontologyTag: 'CONCEPT/RELATIONSHIP_VERB',
    confidence,
    storyBeat: tc.storyBeat,
    chapter: tc.chapter,
  };
}

export function getMockRomanticLexicalInsights(): MockLexicalInsight[] {
  return ROMANTIC_LORE_TEST_CASES.filter((tc) => !tc.isSuggestion).map((tc) => toInsight(tc));
}

export function getMockRomanticGlossaryCues(): MockGlossaryCue[] {
  const seen = new Set<string>();
  const cues: MockGlossaryCue[] = [];
  for (const tc of ROMANTIC_LORE_TEST_CASES) {
    if (seen.has(tc.glossaryCue)) continue;
    seen.add(tc.glossaryCue);
    cues.push({
      cue: tc.glossaryCue,
      category: 'RELATIONSHIP_VERB',
      hint: 'ROMANTIC_RELATIONSHIP',
    });
  }
  return cues;
}

export function getMockLexicalInsightsForFilterTab(tab: RomanticLoreFilterTab): MockLexicalInsight[] {
  return ROMANTIC_LORE_TEST_CASES.filter((tc) => tc.filterTab === tab && !tc.isSuggestion).map((tc) =>
    toInsight(tc)
  );
}
