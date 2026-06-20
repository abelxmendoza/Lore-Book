/** Public LoreBook chronicle content for the marketing Lore page (no auth required). */

export interface PublicMilestone {
  id: string;
  title: string;
  summary: string;
  monthLabel: string;
  significance: 1 | 2 | 3 | 4 | 5;
}

export interface PublicChapter {
  id: string;
  title: string;
  eraLabel: string;
  summary: string;
}

export interface PublicVision {
  version: number;
  label: string;
  vision: string;
  dateLabel: string;
}

export const LOREBOOK_VISIONS: PublicVision[] = [
  {
    version: 1,
    label: 'Version 1 Vision',
    vision: 'Personal AI memory — a chatbot that remembers what you tell it.',
    dateLabel: 'Jan 2025',
  },
  {
    version: 2,
    label: 'Version 2 Vision',
    vision: 'Personal cognition system — continuity, entities, and provenance as the product core.',
    dateLabel: 'Aug 2025',
  },
  {
    version: 3,
    label: 'Version 3 Vision',
    vision: 'Narrative intelligence operating system — every person, place, and story earns a living biography from evidence.',
    dateLabel: 'May 2026',
  },
];

export const LOREBOOK_CHAPTERS: PublicChapter[] = [
  {
    id: 'idea',
    title: 'The Idea Era',
    eraLabel: 'Chapter 1',
    summary: 'The founding vision — memory as product, not feature.',
  },
  {
    id: 'memory',
    title: 'Memory Era',
    eraLabel: 'Chapter 2',
    summary: 'Ingestion, retrieval, and entity linking establish continuity.',
  },
  {
    id: 'identity',
    title: 'Identity Era',
    eraLabel: 'Chapter 3',
    summary: 'Identity integrity and provenance — no silent merges, every claim has evidence.',
  },
  {
    id: 'narrative',
    title: 'Narrative Era',
    eraLabel: 'Chapter 4',
    summary: 'Story engines, life arcs, and custody surfaces turn evidence into narrative.',
  },
  {
    id: 'social',
    title: 'Social Intelligence Era',
    eraLabel: 'Chapter 5',
    summary: 'Agents, kinship, and self-history — LoreBook understands relationships and its own story.',
  },
];

export const LOREBOOK_TIMELINE: PublicMilestone[] = [
  {
    id: 'created',
    title: 'LoreBook Created',
    summary: 'Development begins — an AI built to understand lives, stories, memories, and meaning.',
    monthLabel: 'January 2025',
    significance: 5,
  },
  {
    id: 'memory',
    title: 'Memory Foundations Pipeline',
    summary: 'Ingestion pipeline and semantic retrieval establish the continuity loop.',
    monthLabel: 'March 2025',
    significance: 4,
  },
  {
    id: 'entities',
    title: 'Entity Linking Released',
    summary: 'People, places, and projects resolve across conversations.',
    monthLabel: 'June 2025',
    significance: 3,
  },
  {
    id: 'identity',
    title: 'Identity Integrity System',
    summary: 'Collision detection and truth states prevent silent identity merges.',
    monthLabel: 'October 2025',
    significance: 5,
  },
  {
    id: 'provenance',
    title: 'Provenance System Completed',
    summary: 'Every claim traces to evidence — corrections and cognition mutations.',
    monthLabel: 'February 2026',
    significance: 4,
  },
  {
    id: 'narrative',
    title: 'Narrative Story Engine',
    summary: 'Life arcs, chapters, and turning points synthesized from evidence.',
    monthLabel: 'April 2026',
    significance: 5,
  },
  {
    id: 'custody',
    title: 'What AI Knows Dashboard',
    summary: 'Identity custody — export everything the system holds with truth states.',
    monthLabel: 'May 2026',
    significance: 4,
  },
  {
    id: 'chronicle',
    title: 'LoreBook Chronicle',
    summary: 'LoreBook gains a living project history — milestones, vision, and self-narrative.',
    monthLabel: 'June 2026',
    significance: 5,
  },
];

export function significanceStars(n: number): string {
  const c = Math.min(5, Math.max(1, n));
  return '★'.repeat(c) + '☆'.repeat(5 - c);
}
