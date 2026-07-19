/** Mock timeline moments shown after the generation simulation completes. */

export type MockGeneratedTimelineEvent = {
  id: string;
  start_time: string;
  content: string;
  timeline_names?: string[];
  significance?: 'low' | 'medium' | 'high';
  stateChange?: string;
};

const BASE_MOCK: MockGeneratedTimelineEvent[] = [
  {
    id: 'mock-gen-1',
    start_time: '2019-09-01T00:00:00Z',
    content: 'Started college — first time living away from home. Everything felt wide open.',
    timeline_names: ['Education'],
    significance: 'medium',
    stateChange: 'New chapter',
  },
  {
    id: 'mock-gen-2',
    start_time: '2021-03-15T00:00:00Z',
    content: 'Met the crew that would become your inner circle. Late-night talks on the roof.',
    timeline_names: ['Relationships', 'Social'],
    significance: 'high',
    stateChange: 'Inner circle formed',
  },
  {
    id: 'mock-gen-3',
    start_time: '2022-06-01T00:00:00Z',
    content: 'First real job offer — imposter syndrome and excitement in equal measure.',
    timeline_names: ['Career'],
    significance: 'high',
    stateChange: 'Career arc begins',
  },
  {
    id: 'mock-gen-4',
    start_time: '2023-11-20T00:00:00Z',
    content: 'Burnout season. Started journaling again; LoreBook begins taking shape as an idea.',
    timeline_names: ['Health', 'Creative'],
    significance: 'medium',
    stateChange: 'Creative pivot',
  },
  {
    id: 'mock-gen-5',
    start_time: '2024-08-10T00:00:00Z',
    content: 'Left the day job to build LoreBook full time. Scary, deliberate, irreversible.',
    timeline_names: ['Career', 'Identity'],
    significance: 'high',
    stateChange: 'Turning point',
  },
  {
    id: 'mock-gen-6',
    start_time: '2025-04-02T00:00:00Z',
    content: 'Shipped the first timeline view — seeing your life as swimlanes changed everything.',
    timeline_names: ['Creative', 'Milestone'],
    significance: 'high',
    stateChange: 'Milestone',
  },
];

const THEME_OVERRIDES: Record<string, Partial<MockGeneratedTimelineEvent>[]> = {
  career: [
    { content: 'Internship that taught you what you did not want.', timeline_names: ['Career'] },
    { content: 'Promotion — and the loneliness that came with it.', timeline_names: ['Career'] },
    { content: 'Quit to bet on yourself. The timeline bends here.', timeline_names: ['Career', 'Identity'], stateChange: 'Turning point' },
  ],
  love: [
    { content: 'First date that actually felt easy.', timeline_names: ['Love'] },
    { content: 'The hard conversation that made things real.', timeline_names: ['Love', 'Relationships'] },
    { content: 'Choosing each other again after distance.', timeline_names: ['Love'], stateChange: 'Commitment' },
  ],
  family: [
    { content: 'Thanksgiving where everyone finally showed up.', timeline_names: ['Family'] },
    { content: 'Caring for Grandma Vera — the week that rewired priorities.', timeline_names: ['Family', 'Health'], stateChange: 'Priority shift' },
  ],
  nightlife: [
    { content: 'First night out in the city — neon, strangers, possibility.', timeline_names: ['Social'] },
    { content: 'The after-hours diner where stories got honest.', timeline_names: ['Social', 'Friends'] },
  ],
  project: [
    { start_time: '2025-06-03T09:00:00Z', content: 'Defined the prototype goal at the kitchen table.', timeline_names: ['Creative', 'Project'] },
    { start_time: '2025-06-03T11:00:00Z', content: 'Built the first end-to-end flow and got it running.', timeline_names: ['Creative', 'Project'] },
    { start_time: '2025-06-03T14:00:00Z', content: 'Tested the flow with an alternate account.', timeline_names: ['Creative', 'Project'] },
    { start_time: '2025-06-03T16:00:00Z', content: 'Jamie reviewed the prototype and identified the confusing step.', timeline_names: ['Creative', 'Project'] },
    { start_time: '2025-06-04T10:00:00Z', content: 'Fixed the sync issue and simplified the onboarding path.', timeline_names: ['Creative', 'Project'] },
    { start_time: '2025-06-04T17:00:00Z', content: 'Shipped the first usable version and wrote down the next milestone.', timeline_names: ['Creative', 'Milestone'], stateChange: 'Milestone' },
  ],
};

function pickTheme(query: string): keyof typeof THEME_OVERRIDES | null {
  const q = query.toLowerCase();
  if (/career|job|work|amazon|lorebook/.test(q)) return 'career';
  if (/love|dating|relationship|partner|heartbreak|\balex\b/.test(q)) return 'love';
  if (/family|grandma|grandmother|mom|dad|thanksgiving/.test(q)) return 'family';
  if (/night|club|party|nightlife|bar/.test(q)) return 'nightlife';
  if (/project|sprint|startup|creative|music|writing|photo|fitness/.test(q)) return 'project';
  return null;
}

export function buildMockGeneratedTimeline(query: string): MockGeneratedTimelineEvent[] {
  const theme = pickTheme(query);
  if (!theme) return BASE_MOCK;

  const overrides = THEME_OVERRIDES[theme] ?? [];
  return BASE_MOCK.map((event, i) => ({
    ...event,
    ...(overrides[i % overrides.length] ?? {}),
    id: `mock-gen-${theme}-${i}`,
    content: overrides[i % overrides.length]?.content ?? event.content,
  }));
}
