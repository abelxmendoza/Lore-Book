/**
 * Historical baseline for suggestion cleanup.
 *
 * Old automatic writers cannot be replayed from this checkout without a
 * giant revert. Numbers here are estimated from prior architecture, tests,
 * and known bypasses — not a measured BEFORE run. Current metrics must come
 * from the live eval runner.
 */

export type BaselineKind = 'estimated' | 'measured';

export const SUGGESTION_QUALITY_BASELINE = {
  kind: 'estimated' as BaselineKind,
  label: 'pre-shared-write-gate (estimated)',
  asOf: '2026-08',
  sources: [
    'Automatic extractors called createSkill / createOrganization / createEntity without attach-or-alias',
    'Resume import created employers and skills even when aliases already existed',
    'Dismissal required repeated rejects before becoming permanent (5-count pattern)',
    'Character rescan issued isUserRejectedEntityCard once per detected name (N+1)',
    'Acronym and skill-synonym duplicates (USC vs university, Python programming vs Python)',
    'Weak actors ("her friend") could still be promoted on some paths',
  ],
  notes: [
    'Do not treat these as precise before-counts.',
    'Use them only as directional comparison: current must be measured.',
  ],
  estimated: {
    duplicateCardsOnIdenticalRerun: 'typically > 0 (each extractor independently CREATE_NEW)',
    dismissedEquivalentResurrection: 'non-zero until 5 dismissals stacked',
    repeatedMergeSuggestionsAfterConfirmedMerge: 'non-zero (merge lived in UI, not write gate)',
    notSamePairReSuggested: 'first-name merge suggestions recurred',
    machineCreateDuringDegradedCanonLoad: 'CREATE_NEW continued when index load failed',
    secondPassSemanticWrites: 'evidence + aliases + cards re-inserted',
    characterRejectionLookupsPerRescan: '1 query per detected name',
    cleanupBurdenPer100Candidates: 'high relative to attach-first architecture; unmeasured',
  },
} as const;
