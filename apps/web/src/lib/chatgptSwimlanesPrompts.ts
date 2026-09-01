/**
 * Copyable ChatGPT prompts that help users produce lore LoreBook can turn into
 * dated swimlane bars. Paste answers back via chat, journal, or ChatGPT import.
 */

export type ChatGptSwimlanesPrompt = {
  id: string;
  title: string;
  summary: string;
  prompt: string;
};

export const CHATGPT_SWIMLANES_PROMPTS: readonly ChatGptSwimlanesPrompt[] = [
  {
    id: 'life-chapters',
    title: 'Life chapters with dates',
    summary: 'Multi-month eras with start/end months — best for swimlane bars.',
    prompt: `I'm building a personal timeline in LoreBook. From our past conversations, list the major chapters of my life (jobs, relationships, creative projects, health arcs, inner-life periods).

For each chapter give:
- Title (short, specific)
- Track: career | romance | relationships | creative | health | inner
- Start month/year and end month/year (or "present")
- 2–4 dated anchor moments inside that chapter
- Only facts I actually told you — mark uncertain dates with "?"

Skip hypotheticals, fiction, code snippets, and assistant suggestions I never adopted.`,
  },
  {
    id: 'career-timeline',
    title: 'Work history timeline',
    summary: 'Employers, roles, and month-level dates for the career lane.',
    prompt: `From everything I've shared with you about work and school, produce a chronological work-and-education timeline.

For each role or program include:
- Employer or school name
- Title or degree
- Start month/year and end month/year
- City or remote if I mentioned it
- Whether I still work/study there

Use only my messages as evidence. If a date is fuzzy, give the best month/year guess and label it uncertain.`,
  },
  {
    id: 'relationship-arcs',
    title: 'Relationship chapters',
    summary: 'Dating and close-relationship spans with boundaries respected.',
    prompt: `From our chats, list relationship chapters I described (dating, partnership, breakup, reconciliation, close friendships that shaped a period).

For each:
- Who (first name or label I used)
- Chapter label
- Approximate start and end month/year
- 2–3 dated moments that define the arc

Do not invent people or events. Exclude anything I asked you to treat as private or hypothetical.`,
  },
  {
    id: 'memory-handoff',
    title: 'LoreBook memory handoff',
    summary: 'Structured export for Account → Import My ChatGPT Lore.',
    prompt: `Create a "LoreBook Memory Handoff" document from our conversations.

Sections:
1. Identity & background (only what I stated)
2. People (name, relationship, how I know them)
3. Places & organizations
4. Timeline events with month/year
5. Ongoing chapters (career, romance, creative, health) with date ranges
6. Open questions / dates I'm unsure about

Rules:
- User-stated facts only; no assistant inventions
- Mark uncertain dates with "?"
- No code, prompts, or role-play
- Keep each bullet cite-worthy for a memory review queue`,
  },
] as const;

export function formatChatGptPromptForClipboard(prompt: ChatGptSwimlanesPrompt): string {
  return prompt.prompt.trim();
}
