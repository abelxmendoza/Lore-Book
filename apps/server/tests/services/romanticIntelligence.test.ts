import { describe, expect, it } from 'vitest';
import {
  hasRomanticSignals,
  parseRomanticEpisode,
  summarizeRomanticCorpus,
} from '../../src/services/ontology/romanticIntelligence';
import { ROMANTIC_LORE_TEST_CASES } from '../../src/testFixtures/romanticLoreTestCases';

describe('romanticIntelligence', () => {
  it('detects romantic glossary cues', () => {
    expect(hasRomanticSignals('I have a crush on Jordan from the studio')).toBe(true);
    expect(hasRomanticSignals('Went to Costco with my mom')).toBe(false);
  });

  it('does not tag a romantic hit with a domain word mentioned elsewhere in a long message', () => {
    // The romantic cue and evidence live at the start; "Instagram" and "the
    // show" appear only in an unrelated aside far later in the same message.
    // enrichEntity must scan the evidence window around the cue, not the
    // whole message, or every unrelated word bleeds into ontologyTags.
    const message =
      'Riley is my girlfriend, we have been talking for a few months now and things are going well. ' +
      'Separately, my friend posted on Instagram about the show downtown and I might go check it out this weekend with some coworkers from the office.';
    const hits = parseRomanticEpisode(message);
    const riley = hits.find((h) => h.partnerName === 'Riley');
    expect(riley).toBeDefined();
    expect(riley?.ontologyTags.some((t) => t.startsWith('APP/'))).toBe(false);
    expect(riley?.ontologyTags.some((t) => t.startsWith('EVENT/'))).toBe(false);
  });

  it('parses girlfriend + partner name from live chat shape', () => {
    const hits = parseRomanticEpisode('Alex is my girlfriend — we had date night last week');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].partnerName).toBe('Alex');
    expect(hits[0].relationshipType).toBe('girlfriend');
    expect(hits[0].cues.length).toBeGreaterThan(0);
  });

  it('parses marriage, divorce, and co-parent lexical cues', () => {
    const wife = parseRomanticEpisode('Jamie is my wife — we have been married three years');
    expect(wife[0]?.partnerName).toBe('Jamie');
    expect(wife[0]?.relationshipType).toBe('wife');

    const divorced = parseRomanticEpisode('Avery and I got divorced last year — paperwork is done');
    expect(divorced.some((h) => h.partnerName === 'Avery' && h.relationshipType === 'divorced')).toBe(true);
    expect(divorced.find((h) => h.partnerName === 'Avery')?.status).toBe('ended');

    const babyMama = parseRomanticEpisode('Priya is my baby mama — we co-parent Noah');
    expect(babyMama.some((h) => h.partnerName === 'Priya' && h.relationshipType === 'baby_mama')).toBe(true);

    const babyDaddy = parseRomanticEpisode('Daniel is my baby daddy — he takes weekends with Leo');
    expect(babyDaddy.some((h) => h.partnerName === 'Daniel' && h.relationshipType === 'baby_daddy')).toBe(true);

    const coParent = parseRomanticEpisode('Sage and I co-parent — we share school decisions');
    expect(coParent.some((h) => h.partnerName === 'Sage' && h.relationshipType === 'co_parent')).toBe(true);
  });

  describe.each(
    ROMANTIC_LORE_TEST_CASES.filter((tc) => !tc.isSuggestion)
  )('lore fixture $id', (tc) => {
    it(`detects romantic signals in: ${tc.label}`, () => {
      expect(hasRomanticSignals(tc.chatSnippet)).toBe(true);
    });

    it(`extracts partner ${tc.expectedPartner}`, () => {
      const hits = parseRomanticEpisode(tc.chatSnippet);
      expect(hits.some((h) => h.partnerName === tc.expectedPartner)).toBe(true);
    });

    it(`maps relationship type for ${tc.expectedPartner}`, () => {
      const hits = parseRomanticEpisode(tc.chatSnippet);
      const hit = hits.find((h) => h.partnerName === tc.expectedPartner);
      expect(hit).toBeDefined();
      expect(hit!.relationshipType).toBe(tc.expectedType);
    });
  });

  describe.each(
    ROMANTIC_LORE_TEST_CASES.filter((tc) =>
      ['ghosted', 'blocked', 'ended', 'rekindled', 'on_break', 'complicated', 'unrequited'].includes(tc.expectedStatus)
    )
  )('status fixture $id', (tc) => {
    it(`infers status ${tc.expectedStatus} for ${tc.expectedPartner}`, () => {
      const hits = parseRomanticEpisode(tc.chatSnippet);
      const hit = hits.find((h) => h.partnerName === tc.expectedPartner);
      expect(hit?.status).toBe(tc.expectedStatus);
    });
  });

  it('summarizes corpus with deduped partners', () => {
    const snippets = ROMANTIC_LORE_TEST_CASES.slice(0, 5).map((tc) => tc.chatSnippet);
    const summary = summarizeRomanticCorpus(snippets);
    expect(summary.romanticEpisodes).toBe(5);
    expect(summary.hits.length).toBeGreaterThan(0);
    expect(summary.glossaryCues.length).toBeGreaterThan(0);
  });
});
