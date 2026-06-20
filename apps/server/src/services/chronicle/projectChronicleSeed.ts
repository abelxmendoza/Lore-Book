import {
  ChronicleChapter,
  ChronicleEntity,
  ChronicleEntityKind,
  ChronicleMilestone,
  ChronicleStage,
  ChronicleVisionSnapshot,
  DevelopmentStage,
  MilestoneCategory,
  MilestoneSignificance,
  SelfNarrativeChapter,
  significanceToStars,
} from './projectChronicleTypes';

export const FOUNDER_ENTITY: ChronicleEntity = {
  id: 'founder-abel-mendoza',
  kind: ChronicleEntityKind.FOUNDER,
  name: 'Abel Mendoza',
  title: 'Founder & Creator',
  fields: {
    roles: ['Founder', 'Creator', 'Visionary'],
    startedProjectDate: '2025-01-01',
    philosophy:
      'Build systems that earn understanding over time — not chatbots with memory bolted on.',
    goals: [
      'Create an AI capable of understanding human lives, stories, memories, relationships, and meaning',
      'Make continuity the product, not a feature',
      'Turn provenance and narrative intelligence into first-class architecture',
    ],
    majorContributions: [
      'LoreBook continuity loop architecture',
      'Identity integrity and collision detection',
      'Narrative intelligence spine',
      'Provenance graph and correction authority',
      'Lore Agents orchestration layer',
    ],
  },
};

export const ORGANIZATION_ENTITY: ChronicleEntity = {
  id: 'org-omega-technologies',
  kind: ChronicleEntityKind.ORGANIZATION,
  name: 'Omega Technologies',
  fields: {
    mission: 'Build narrative intelligence systems that understand human lives with evidence and provenance.',
    products: ['LoreBook', 'Lorekeeper'],
    vision: 'A narrative intelligence operating system for personal cognition.',
    founders: ['Abel Mendoza'],
    teamMembers: ['Abel Mendoza'],
  },
};

export const PRODUCT_ENTITY: ChronicleEntity = {
  id: 'product-lorebook',
  kind: ChronicleEntityKind.PRODUCT,
  name: 'LoreBook',
  fields: {
    currentVersion: '0.1.0',
    currentStage: DevelopmentStage.BETA,
    tagline: 'A system that gradually understands your life.',
    majorCapabilities: [
      'Conversational runtime with durable memory ingestion',
      'Entity resolution and identity integrity',
      'Provenance graph and correction authority',
      'Narrative spine, life arcs, and chronology',
      'Lore Agents — memory, identity, narrative, contradiction, system cognition',
      'Omni Timeline and living project chronicle',
    ],
    roadmapProgress: '72% toward platform maturity',
  },
};

export const STAGE: ChronicleStage = {
  current: DevelopmentStage.BETA,
  progressPercent: 72,
  label: 'Beta — narrative intelligence architecture maturing',
  updatedAt: '2026-06-18T00:00:00.000Z',
};

export const VISION_SNAPSHOTS: ChronicleVisionSnapshot[] = [
  {
    id: 'vision-v1',
    version: 1,
    label: 'Version 1 Vision',
    vision: 'Personal AI memory — a chatbot that remembers what you tell it.',
    recordedAt: '2025-01-15T00:00:00.000Z',
  },
  {
    id: 'vision-v2',
    version: 2,
    label: 'Version 2 Vision',
    vision: 'Personal cognition system — continuity, entities, and provenance as the product core.',
    recordedAt: '2025-09-01T00:00:00.000Z',
  },
  {
    id: 'vision-v3',
    version: 3,
    label: 'Version 3 Vision',
    vision: 'Narrative intelligence operating system — every person, place, and story earns a living biography from evidence.',
    recordedAt: '2026-06-01T00:00:00.000Z',
  },
];

const rawMilestones: Omit<ChronicleMilestone, 'stars'>[] = [
  {
    id: 'ms-lorebook-created',
    slug: 'lorebook-created',
    title: 'LoreBook Created',
    summary: 'Abel begins development of LoreBook — an AI that understands human lives, stories, memories, relationships, and meaning.',
    occurredAt: '2025-01-01T00:00:00.000Z',
    significance: MilestoneSignificance.TRANSFORMATIONAL,
    category: MilestoneCategory.FOUNDING,
    chapterId: 'ch-idea',
  },
  {
    id: 'ms-memory-foundations',
    slug: 'memory-foundations',
    title: 'Memory Foundations Pipeline',
    summary: 'Ingestion pipeline, journal entries, and semantic retrieval establish the continuity loop.',
    occurredAt: '2025-03-01T00:00:00.000Z',
    significance: MilestoneSignificance.MAJOR,
    category: MilestoneCategory.ARCHITECTURE,
    chapterId: 'ch-memory',
  },
  {
    id: 'ms-entity-linking',
    slug: 'entity-linking',
    title: 'Entity Linking Released',
    summary: 'People, places, and projects resolve across conversations with deduplication and canonical mapping.',
    occurredAt: '2025-06-15T00:00:00.000Z',
    significance: MilestoneSignificance.MODERATE,
    category: MilestoneCategory.NEW_CAPABILITY,
    chapterId: 'ch-memory',
  },
  {
    id: 'ms-identity-integrity',
    slug: 'identity-integrity',
    title: 'Identity Integrity System',
    summary: 'Collision detection, correction authority, and truth states prevent silent identity merges.',
    occurredAt: '2025-10-01T00:00:00.000Z',
    significance: MilestoneSignificance.TRANSFORMATIONAL,
    category: MilestoneCategory.ARCHITECTURE,
    chapterId: 'ch-identity',
  },
  {
    id: 'ms-provenance-graph',
    slug: 'provenance-graph',
    title: 'Provenance System Completed',
    summary: 'Every claim traces to evidence — cognition mutations, MRQ, and correction workflows.',
    occurredAt: '2026-02-01T00:00:00.000Z',
    significance: MilestoneSignificance.MAJOR,
    category: MilestoneCategory.ARCHITECTURE,
    chapterId: 'ch-identity',
  },
  {
    id: 'ms-narrative-engine',
    slug: 'narrative-story-engine',
    title: 'Narrative Story Engine Completed',
    summary: 'Life arcs, chapters, turning points, and Story-of-Self synthesis from accumulated evidence.',
    occurredAt: '2026-04-01T00:00:00.000Z',
    significance: MilestoneSignificance.TRANSFORMATIONAL,
    category: MilestoneCategory.TECHNICAL_BREAKTHROUGH,
    chapterId: 'ch-narrative',
  },
  {
    id: 'ms-what-ai-knows',
    slug: 'what-ai-knows-dashboard',
    title: 'What AI Knows Dashboard Launched',
    summary: 'Identity custody surface — users export everything the system holds with truth states.',
    occurredAt: '2026-05-01T00:00:00.000Z',
    significance: MilestoneSignificance.MAJOR,
    category: MilestoneCategory.UX_RELEASE,
    chapterId: 'ch-narrative',
  },
  {
    id: 'ms-lore-agents',
    slug: 'lore-agents-orchestration',
    title: 'Lore Agents Orchestration Layer',
    summary: 'Memory, identity, narrative, contradiction, and system agents coordinate through a shared tool layer.',
    occurredAt: '2026-06-10T00:00:00.000Z',
    significance: MilestoneSignificance.MAJOR,
    category: MilestoneCategory.NEW_CAPABILITY,
    chapterId: 'ch-social',
  },
  {
    id: 'ms-omni-timeline',
    slug: 'omni-timeline',
    title: 'Omni Timeline Universal Search',
    summary: 'Timeline swimlanes, hierarchy panel, and universal search across life arcs.',
    occurredAt: '2026-06-15T00:00:00.000Z',
    significance: MilestoneSignificance.MAJOR,
    category: MilestoneCategory.UX_RELEASE,
    chapterId: 'ch-narrative',
  },
  {
    id: 'ms-chronicle',
    slug: 'lorebook-chronicle',
    title: 'LoreBook Chronicle — Living Project History',
    summary: 'LoreBook gains a self-narrative: milestones, vision evolution, and automatic project autobiography.',
    occurredAt: '2026-06-18T00:00:00.000Z',
    significance: MilestoneSignificance.TRANSFORMATIONAL,
    category: MilestoneCategory.NEW_CAPABILITY,
    chapterId: 'ch-social',
  },
  {
    id: 'ms-social-intelligence',
    slug: 'social-intelligence-engine',
    title: 'Social Intelligence Engine',
    summary: 'Kinship inference, relationship peripherals, and social projection layers deepen interpersonal understanding.',
    occurredAt: '2026-06-12T00:00:00.000Z',
    significance: MilestoneSignificance.MAJOR,
    category: MilestoneCategory.TECHNICAL_BREAKTHROUGH,
    chapterId: 'ch-social',
  },
];

export const SEED_MILESTONES: ChronicleMilestone[] = rawMilestones.map((m) => ({
  ...m,
  stars: significanceToStars(m.significance),
}));

export const SEED_CHAPTERS: ChronicleChapter[] = [
  {
    id: 'ch-idea',
    slug: 'idea-era',
    title: 'The Idea Era',
    eraLabel: 'Chapter 1',
    summary: 'The founding vision — memory as product, not feature.',
    sortOrder: 1,
    milestoneIds: ['ms-lorebook-created'],
  },
  {
    id: 'ch-memory',
    slug: 'memory-era',
    title: 'Memory Era',
    eraLabel: 'Chapter 2',
    summary: 'Ingestion, retrieval, and entity linking establish continuity.',
    sortOrder: 2,
    milestoneIds: ['ms-memory-foundations', 'ms-entity-linking'],
  },
  {
    id: 'ch-identity',
    slug: 'identity-era',
    title: 'Identity Era',
    eraLabel: 'Chapter 3',
    summary: 'Identity integrity and provenance — no silent merges, every claim has evidence.',
    sortOrder: 3,
    milestoneIds: ['ms-identity-integrity', 'ms-provenance-graph'],
  },
  {
    id: 'ch-narrative',
    slug: 'narrative-era',
    title: 'Narrative Era',
    eraLabel: 'Chapter 4',
    summary: 'Story engines, life arcs, and custody surfaces turn evidence into narrative.',
    sortOrder: 4,
    milestoneIds: ['ms-narrative-engine', 'ms-what-ai-knows', 'ms-omni-timeline'],
  },
  {
    id: 'ch-social',
    slug: 'social-intelligence-era',
    title: 'Social Intelligence Era',
    eraLabel: 'Chapter 5',
    summary: 'Agents, kinship, and self-history — LoreBook understands relationships and its own story.',
    sortOrder: 5,
    milestoneIds: ['ms-lore-agents', 'ms-social-intelligence', 'ms-chronicle'],
  },
];

export const SELF_NARRATIVE_CHAPTERS: SelfNarrativeChapter[] = [
  {
    chapterNumber: 1,
    title: 'The Idea',
    body: 'LoreBook began as a conviction: continuity is the product. Not a chatbot with memory bolted on, but a system that gradually understands a human life.',
  },
  {
    chapterNumber: 2,
    title: 'Memory Foundations',
    body: 'Every message passes through ingestion — people, places, patterns persist. The assistant reads from a growing record on every response.',
  },
  {
    chapterNumber: 3,
    title: 'Identity Integrity',
    body: 'Names collide. Identities drift. LoreBook learned to detect collisions, track truth states, and never silently merge who someone is.',
  },
  {
    chapterNumber: 4,
    title: 'Narrative Intelligence',
    body: 'Life arcs, chapters, and turning points emerge from evidence. The Story-of-Self engine turns accumulated lore into biography.',
  },
  {
    chapterNumber: 5,
    title: 'Social Intelligence',
    body: 'Kinship graphs, relationship peripherals, and Lore Agents coordinate memory, identity, narrative, and contradiction — and LoreBook begins writing its own chronicle.',
  },
];
