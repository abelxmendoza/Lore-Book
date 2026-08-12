import {
  CHAT_FOCUS_SOURCE_LABELS,
  type ChatFocus,
  type ChatFocusSourceSurface,
} from '../types/chatFocus';

import type { BookQueryDomain } from './api-contracts';
import { openChatWithFocus } from './openChatWithFocus';

export const BOOK_QUERY_FOCUS_ID_PREFIX = 'book:';

export type BookQueryChatPreset = {
  entityName: string;
  sourceSurface: ChatFocusSourceSurface;
  sourceLabel: string;
  knowledgeScope: string;
  description: string;
  placeholder: string;
};

export const BOOK_QUERY_CHAT_PRESETS: Record<BookQueryDomain, BookQueryChatPreset> = {
  character: {
    entityName: 'People & Characters',
    sourceSurface: 'characters',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.characters,
    knowledgeScope:
      'names, aliases, roles, relationship context, and Character Book records — answer from this book, not a single person unless the question names one',
    description: 'Ask about people in main chat. LoreBook will attach Character Book as focus.',
    placeholder: 'Try “Who are my creative collaborators?”',
  },
  organization: {
    entityName: 'Groups & Organizations',
    sourceSurface: 'organizations',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.organizations,
    knowledgeScope:
      'group relationships, rosters, locations, activity, and records that need cleanup — answer from this book, not a single group unless the question names one',
    description: 'Ask about groups in main chat. LoreBook will attach Groups & Organizations as focus.',
    placeholder: 'Try “Which groups is Marcus connected to?”',
  },
  family: {
    entityName: 'Family & Family Tree',
    sourceSurface: 'family',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.family,
    knowledgeScope:
      'relatives, branches, generations, households, evidence, closeness, and records needing review — answer from the family tree, not a single relative unless the question names one',
    description: 'Ask about family in main chat. LoreBook will attach Family as focus.',
    placeholder: 'Try “Show my maternal cousins”',
  },
  location: {
    entityName: 'Places Book',
    sourceSurface: 'locations',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.locations,
    knowledgeScope:
      'visits, mentions, people, organizations, geography, nested places, and records that need cleanup — answer from Places Book, not a single place unless the question names one',
    description: 'Ask about places in main chat. LoreBook will attach Places as focus.',
    placeholder: 'Try “places I visited with Marcus”',
  },
  romance: {
    entityName: 'Dating & Romance',
    sourceSurface: 'love',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.love,
    knowledgeScope:
      'current and past connections, crushes, situationships, history, risk flags, evidence strength, and Character Book linkage — answer from Dating & Romance, not a single person unless the question names one',
    description: 'Ask about dating and romance in main chat. LoreBook will attach Dating & Romance as focus.',
    placeholder: 'Try “show my past relationships”',
  },
  project: {
    entityName: 'Projects Book',
    sourceSurface: 'projects',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.projects,
    knowledgeScope:
      'project status, type, tags, dates, importance, and records that need review — answer from Projects Book, not a single project unless the question names one',
    description: 'Ask about projects in main chat. LoreBook will attach Projects as focus.',
    placeholder: 'Try “show my active software projects”',
  },
  skill: {
    entityName: 'Skills Book',
    sourceSurface: 'skills',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.skills,
    knowledgeScope:
      'practice, growth, work use, related projects, proficiency, and evidence — answer from Skills Book, not a single skill unless the question names one',
    description: 'Ask about skills in main chat. LoreBook will attach Skills as focus.',
    placeholder: 'Try “which skills do I use for Vanguard Robotics?”',
  },
  quest: {
    entityName: 'Quest Log',
    sourceSurface: 'quests',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.quests,
    knowledgeScope:
      'active, paused, and completed quests, priorities, and next steps — answer from the Quest Log, not a single quest unless the question names one',
    description: 'Ask about quests in main chat. LoreBook will attach Quests as focus.',
    placeholder: 'Try “What am I currently working on?”',
  },
  event: {
    entityName: 'Life Log',
    sourceSurface: 'events',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.events,
    knowledgeScope:
      'moments by people, places, activities, participation, chronology, and evidence — answer from the Life Log, not a single moment unless the question names one',
    description: 'Ask about moments in main chat. LoreBook will attach Life Log as focus.',
    placeholder: 'Try “What happened with Marcus at the workshop?”',
  },
  document: {
    entityName: 'Documents',
    sourceSurface: 'documents',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.documents,
    knowledgeScope:
      'uploaded sources by filename, type, processing state, and the lore derived from them — answer from Documents, not a single file unless the question names one',
    description: 'Ask about documents in main chat. LoreBook will attach Documents as focus.',
    placeholder: 'Try “Which files created career facts?”',
  },
  narrative: {
    entityName: 'Narrative Anchors',
    sourceSurface: 'anchors',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.anchors,
    knowledgeScope:
      'durable eras, relationship arcs, communities, projects, places, and recurring themes — answer from Narrative Anchors, not a single chapter unless the question names one',
    description: 'Ask about story threads in main chat. LoreBook will attach Narrative Anchors as focus.',
    placeholder: 'Try “Which chapters connect my creative work and friends?”',
  },
};

const LOREBOOK_QUERY_PRESET: BookQueryChatPreset = {
  entityName: 'Your story',
  sourceSurface: 'lorebook',
  sourceLabel: CHAT_FOCUS_SOURCE_LABELS.lorebook,
  knowledgeScope:
    'people, places, relationships, projects, skills, quests, events, documents, and story — answer from Living Memory and do not invent biographical detail',
  description: 'Ask across your books in main chat. LoreBook will attach your story as focus.',
  placeholder: 'Try “What skills support my active quests?”',
};

export function isBookQueryFocus(focus: Pick<ChatFocus, 'entityId'>): boolean {
  return focus.entityId.startsWith(BOOK_QUERY_FOCUS_ID_PREFIX);
}

export function resolveBookQueryChatPreset(domains?: BookQueryDomain[]): {
  domainKey: string;
  preset: BookQueryChatPreset;
} {
  const unique = [...new Set(domains ?? [])];
  const onlyDomain = unique.length === 1 ? unique[0] : undefined;
  if (onlyDomain) {
    return { domainKey: onlyDomain, preset: BOOK_QUERY_CHAT_PRESETS[onlyDomain] };
  }
  return { domainKey: 'lorebook', preset: LOREBOOK_QUERY_PRESET };
}

/**
 * Open main chat focused on a whole book (or LoreBook) with the typed query
 * prefilled. This is conversational context only — not a fake entity chip.
 */
export function openBookQueryChat(query: string, domains?: BookQueryDomain[]): void {
  const trimmed = query.trim();
  if (!trimmed) return;

  const unique = [...new Set(domains ?? [])];
  const { domainKey, preset } = resolveBookQueryChatPreset(unique);
  const knowledgeScope =
    unique.length > 1
      ? `Answer from ${unique.map((domain) => BOOK_QUERY_CHAT_PRESETS[domain].entityName).join(', ')}. ${preset.knowledgeScope}`
      : preset.knowledgeScope;

  openChatWithFocus({
    entityId: `${BOOK_QUERY_FOCUS_ID_PREFIX}${domainKey}`,
    entityName: preset.entityName,
    entityType: 'memory',
    sourceSurface: preset.sourceSurface,
    sourceLabel: preset.sourceLabel,
    knowledgeScope,
    initialPrompt: trimmed,
    arrivedAt: Date.now(),
  });
}
