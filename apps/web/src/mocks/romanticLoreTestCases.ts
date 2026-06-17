/**
 * Canonical Love & Relationships lore fixtures — shared by server tests and web mock UI.
 * Each case maps a chat snippet → expected lexical parse → demo relationship card.
 */

export type RomanticLoreCategory =
  | 'active_committed'
  | 'crush'
  | 'situationship'
  | 'ghosted'
  | 'past_ended'
  | 'intense_past'
  | 'infatuation'
  | 'blocked'
  | 'rekindled'
  | 'dating_new'
  | 'talking'
  | 'on_break'
  | 'complicated'
  | 'unrequited';

export type RomanticLoreFilterTab =
  | 'all'
  | 'active'
  | 'past'
  | 'no_contact'
  | 'reconnection'
  | 'situationships'
  | 'dating'
  | 'crushes'
  | 'high_risk';

export type RomanticLoreCharacter = {
  id: string;
  name: string;
  role: string;
  connection: string;
  relationshipId?: string;
};

export type RomanticLoreTestCase = {
  id: string;
  category: RomanticLoreCategory;
  label: string;
  filterTab: RomanticLoreFilterTab;
  chapter: number;
  storyBeat: string;
  chatSnippet: string;
  expectedPartner: string;
  expectedType: string;
  expectedStatus: string;
  glossaryCue: string;
  lexicalSnippet: string;
  connectedCharacterIds: string[];
  relationshipId?: string;
  isSuggestion?: boolean;
};

export const ROMANTIC_LORE_SYNOPSIS =
  'After an intense chapter with Morgan and a painful ending with Nova, you rebuilt. Taylor taught you what you did not want. Alex became home. Jordan lingers as a crush from Taylor\'s art world. Sam and Riley trace the same summer party — one a situationship, one a ghost. Elena reappears with respect. Priya opens a new dating arc. The lore is one timeline, not isolated cards.';

export const ROMANTIC_LORE_CHAPTERS = [
  { chapter: 1, title: 'Fire & Burnout', summary: 'Morgan intensity → Nova blocked. High risk, no contact.' },
  { chapter: 2, title: 'Lessons & Distance', summary: 'Taylor breakup. Jordan crush enters through the studio.' },
  { chapter: 3, title: 'Present Tense', summary: 'Alex committed. Sam situationship. Casey infatuation.' },
  { chapter: 4, title: 'Loose Ends', summary: 'Riley ghosted. Elena rekindled. Priya & Daniel on the horizon.' },
] as const;

export const ROMANTIC_LORE_CHARACTERS: RomanticLoreCharacter[] = [
  { id: 'char-alex', name: 'Alex', role: 'Girlfriend', connection: 'Current partner — met after Taylor', relationshipId: 'rel-001' },
  { id: 'char-jordan', name: 'Jordan', role: 'Crush', connection: 'Art studio — Taylor\'s circle', relationshipId: 'rel-002' },
  { id: 'char-sam', name: 'Sam', role: 'Situationship', connection: 'Same summer scene as Riley', relationshipId: 'rel-003' },
  { id: 'char-taylor', name: 'Taylor', role: 'Ex-girlfriend', connection: 'Ended over life goals — introduced art world', relationshipId: 'rel-004' },
  { id: 'char-morgan', name: 'Morgan', role: 'Ex-lover', connection: 'Intense past — predates Taylor', relationshipId: 'rel-005' },
  { id: 'char-casey', name: 'Casey', role: 'Infatuation', connection: 'New energy at work', relationshipId: 'rel-006' },
  { id: 'char-riley', name: 'Riley', role: 'Ghosted hookup', connection: 'Sam\'s party circuit', relationshipId: 'rel-007' },
  { id: 'char-nova', name: 'Nova', role: 'Blocked ex', connection: 'Morgan-era fallout', relationshipId: 'rel-008' },
  { id: 'char-elena', name: 'Elena', role: 'Rekindled ex', connection: 'College sweetheart — respectful ending', relationshipId: 'rel-009' },
  { id: 'char-priya', name: 'Priya', role: 'New dating', connection: 'Fresh arc — not on a card yet', relationshipId: undefined },
  { id: 'char-daniel', name: 'Daniel', role: 'Talking stage', connection: 'Undefined — suggestion only', relationshipId: undefined },
];

export const ROMANTIC_LORE_TEST_CASES: RomanticLoreTestCase[] = [
  {
    id: 'lore-alex-girlfriend',
    category: 'active_committed',
    label: 'Committed partner',
    filterTab: 'active',
    chapter: 3,
    storyBeat: 'Alex is the stable center after Taylor.',
    chatSnippet: 'Alex is my girlfriend — we had our three-month anniversary dinner at the place by the park.',
    expectedPartner: 'Alex',
    expectedType: 'girlfriend',
    expectedStatus: 'active',
    glossaryCue: 'my girlfriend',
    lexicalSnippet: '…Alex is my girlfriend — we had our three-month anniversary dinner…',
    connectedCharacterIds: ['char-taylor', 'char-alex'],
    relationshipId: 'rel-001',
  },
  {
    id: 'lore-jordan-crush',
    category: 'crush',
    label: 'Studio crush',
    filterTab: 'crushes',
    chapter: 2,
    storyBeat: 'Jordan appeared through Taylor\'s art studio world.',
    chatSnippet: 'I have a crush on Jordan from the art studio — Taylor introduced us but I am not sure they feel the same.',
    expectedPartner: 'Jordan',
    expectedType: 'crush',
    expectedStatus: 'active',
    glossaryCue: 'crush on',
    lexicalSnippet: '…I have a crush on Jordan from the art studio — not sure if they feel the same…',
    connectedCharacterIds: ['char-taylor', 'char-jordan'],
    relationshipId: 'rel-002',
  },
  {
    id: 'lore-sam-situationship',
    category: 'situationship',
    label: 'Undefined summer',
    filterTab: 'situationships',
    chapter: 3,
    storyBeat: 'Sam shares the party circuit with Riley.',
    chatSnippet: 'It is a situationship with Sam — fun but no label and they disappear for days without explaining.',
    expectedPartner: 'Sam',
    expectedType: 'situationship',
    expectedStatus: 'active',
    glossaryCue: 'situationship',
    lexicalSnippet: '…it\'s a situationship with Sam — fun but no label…',
    connectedCharacterIds: ['char-sam', 'char-riley'],
    relationshipId: 'rel-003',
  },
  {
    id: 'lore-taylor-breakup',
    category: 'past_ended',
    label: 'Mutual breakup',
    filterTab: 'past',
    chapter: 2,
    storyBeat: 'Taylor ended when life goals diverged — led to Alex.',
    chatSnippet: 'Taylor and I broke up a year ago — we wanted different things and it was mutual but sad.',
    expectedPartner: 'Taylor',
    expectedType: 'ex_girlfriend',
    expectedStatus: 'ended',
    glossaryCue: 'broke up',
    lexicalSnippet: '…Taylor and I broke up a year ago — we wanted different things…',
    connectedCharacterIds: ['char-taylor', 'char-alex', 'char-jordan'],
    relationshipId: 'rel-004',
  },
  {
    id: 'lore-morgan-intense',
    category: 'intense_past',
    label: 'Intense ex-lover',
    filterTab: 'past',
    chapter: 1,
    storyBeat: 'Morgan was the fire before Taylor — codependent arc.',
    chatSnippet: 'Morgan was my ex lover — the deepest connection I have felt but it burned out fast.',
    expectedPartner: 'Morgan',
    expectedType: 'ex_lover',
    expectedStatus: 'ended',
    glossaryCue: 'ex lover',
    lexicalSnippet: '…Morgan was my ex lover — intense connection but too codependent…',
    connectedCharacterIds: ['char-morgan', 'char-nova'],
    relationshipId: 'rel-005',
  },
  {
    id: 'lore-casey-infatuation',
    category: 'infatuation',
    label: 'Work infatuation',
    filterTab: 'crushes',
    chapter: 3,
    storyBeat: 'Casey is new butterflies — separate from Alex.',
    chatSnippet: 'Total infatuation with Casey lately — butterflies every time I see them at work.',
    expectedPartner: 'Casey',
    expectedType: 'infatuation',
    expectedStatus: 'active',
    glossaryCue: 'infatuation',
    lexicalSnippet: '…total infatuation with Casey — butterflies every time I see them…',
    connectedCharacterIds: ['char-casey', 'char-alex'],
    relationshipId: 'rel-006',
  },
  {
    id: 'lore-riley-ghosted',
    category: 'ghosted',
    label: 'Ghosted hookup',
    filterTab: 'no_contact',
    chapter: 4,
    storyBeat: 'Riley vanished after the same party season as Sam.',
    chatSnippet: 'Riley ghosted me after we hooked up — left on read for two weeks straight.',
    expectedPartner: 'Riley',
    expectedType: 'hooking_up',
    expectedStatus: 'ghosted',
    glossaryCue: 'ghosted me',
    lexicalSnippet: '…Riley ghosted me after we hooked up — left on read for two weeks…',
    connectedCharacterIds: ['char-riley', 'char-sam'],
    relationshipId: 'rel-007',
  },
  {
    id: 'lore-nova-blocked',
    category: 'blocked',
    label: 'Blocked ex',
    filterTab: 'no_contact',
    chapter: 1,
    storyBeat: 'Nova blocked after Morgan-era volatility.',
    chatSnippet: 'Nova blocked me after things got too intense — there is no way to reach out now.',
    expectedPartner: 'Nova',
    expectedType: 'ex_lover',
    expectedStatus: 'blocked',
    glossaryCue: 'blocked me',
    lexicalSnippet: '…Nova blocked me after things got too intense…',
    connectedCharacterIds: ['char-nova', 'char-morgan'],
    relationshipId: 'rel-008',
  },
  {
    id: 'lore-elena-rekindled',
    category: 'rekindled',
    label: 'Respectful rekindling',
    filterTab: 'reconnection',
    chapter: 4,
    storyBeat: 'Elena — college love with healthy closure, talking again.',
    chatSnippet: 'Elena and I might be rekindled — we are talking again with real mutual respect after years apart.',
    expectedPartner: 'Elena',
    expectedType: 'ex_girlfriend',
    expectedStatus: 'rekindled',
    glossaryCue: 'rekindled',
    lexicalSnippet: '…Elena and I might be rekindled — we\'re talking again with mutual respect…',
    connectedCharacterIds: ['char-elena'],
    relationshipId: 'rel-009',
  },
  {
    id: 'lore-priya-dating',
    category: 'dating_new',
    label: 'New dating arc',
    filterTab: 'dating',
    chapter: 4,
    storyBeat: 'Priya — fresh dating thread, not yet a full card.',
    chatSnippet: 'I went on a date with Priya last night — coffee turned into a four-hour conversation.',
    expectedPartner: 'Priya',
    expectedType: 'dating',
    expectedStatus: 'active',
    glossaryCue: 'went on a date',
    lexicalSnippet: '…went on a date with Priya — coffee turned into a four-hour conversation…',
    connectedCharacterIds: ['char-priya'],
    isSuggestion: true,
  },
  {
    id: 'lore-daniel-talking',
    category: 'talking',
    label: 'Talking stage',
    filterTab: 'situationships',
    chapter: 4,
    storyBeat: 'Daniel — early talking stage, suggestion only.',
    chatSnippet: 'I am in a talking stage with Daniel and honestly have no idea what we are yet.',
    expectedPartner: 'Daniel',
    expectedType: 'talking',
    expectedStatus: 'active',
    glossaryCue: 'talking stage',
    lexicalSnippet: '…talking stage with Daniel — no idea what we are yet…',
    connectedCharacterIds: ['char-daniel', 'char-sam'],
    isSuggestion: true,
  },
  {
    id: 'lore-alex-on-break',
    category: 'on_break',
    label: 'On a break (variant)',
    filterTab: 'high_risk',
    chapter: 3,
    storyBeat: 'Stress-test variant — Alex on a break (parser variant).',
    chatSnippet: 'My girlfriend Alex and I are on a break right now — we need space but I still care.',
    expectedPartner: 'Alex',
    expectedType: 'girlfriend',
    expectedStatus: 'on_break',
    glossaryCue: 'on a break',
    lexicalSnippet: '…Alex and I are on a break right now…',
    connectedCharacterIds: ['char-alex'],
    relationshipId: 'rel-001',
  },
  {
    id: 'lore-sam-complicated',
    category: 'complicated',
    label: 'Complicated label',
    filterTab: 'high_risk',
    chapter: 3,
    storyBeat: 'Sam thread — complicated status variant.',
    chatSnippet: 'Things with Sam are complicated — not enemies but definitely not official.',
    expectedPartner: 'Sam',
    expectedType: 'situationship',
    expectedStatus: 'complicated',
    glossaryCue: 'complicated',
    lexicalSnippet: '…things with Sam are complicated — not official…',
    connectedCharacterIds: ['char-sam'],
    relationshipId: 'rel-003',
  },
  {
    id: 'lore-jordan-unrequited',
    category: 'unrequited',
    label: 'One-sided feelings',
    filterTab: 'crushes',
    chapter: 2,
    storyBeat: 'Jordan variant — unrequited parsing.',
    chatSnippet: 'My feelings for Jordan feel unrequited — one-sided and they do not see me that way.',
    expectedPartner: 'Jordan',
    expectedType: 'crush',
    expectedStatus: 'unrequited',
    glossaryCue: 'crush on',
    lexicalSnippet: '…feelings for Jordan feel unrequited — one-sided…',
    connectedCharacterIds: ['char-jordan'],
    relationshipId: 'rel-002',
  },
];

export type RomanticPeripheryLoreCase = {
  id: string;
  anchorName: string;
  relationshipId: string;
  peripheralSurface: string;
  role: string;
  tier: 'suspected' | 'confirmed';
  chatSnippet: string;
  glossaryCue: string;
};

export const ROMANTIC_PERIPHERY_LORE_CASES: RomanticPeripheryLoreCase[] = [
  {
    id: 'periph-lore-sam-marcus',
    anchorName: 'Sam',
    relationshipId: 'rel-003',
    peripheralSurface: 'Marcus',
    role: 'side_partner',
    tier: 'suspected',
    chatSnippet: 'Sam was texting Marcus while we were still seeing each other last summer.',
    glossaryCue: 'texting another',
  },
  {
    id: 'periph-lore-alex-coworker',
    anchorName: 'Alex',
    relationshipId: 'rel-001',
    peripheralSurface: 'someone at work',
    role: 'crush',
    tier: 'suspected',
    chatSnippet: "Alex mentioned she's been talking to someone at work — I haven't met them.",
    glossaryCue: 'talking to other',
  },
  {
    id: 'periph-lore-taylor-jordan',
    anchorName: 'Taylor',
    relationshipId: 'rel-004',
    peripheralSurface: 'Jordan',
    role: 'current_partner',
    tier: 'confirmed',
    chatSnippet: 'Taylor and Jordan are together now — I heard from the art studio.',
    glossaryCue: 'they are together',
  },
];

export function getLoreTestCasesByCategory(category: RomanticLoreCategory): RomanticLoreTestCase[] {
  return ROMANTIC_LORE_TEST_CASES.filter((c) => c.category === category);
}

export function getLoreTestCasesByFilterTab(tab: RomanticLoreFilterTab): RomanticLoreTestCase[] {
  return ROMANTIC_LORE_TEST_CASES.filter((c) => c.filterTab === tab);
}

export function getLoreCharacterByName(name: string): RomanticLoreCharacter | undefined {
  return ROMANTIC_LORE_CHARACTERS.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

export function getLoreLexicalSnippetMap(): Record<string, { cue: string; snippet: string }> {
  const map: Record<string, { cue: string; snippet: string }> = {};
  for (const tc of ROMANTIC_LORE_TEST_CASES) {
    if (!tc.isSuggestion && tc.relationshipId && !map[tc.expectedPartner]) {
      map[tc.expectedPartner] = { cue: tc.glossaryCue, snippet: tc.lexicalSnippet };
    }
  }
  return map;
}
