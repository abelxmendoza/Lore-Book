import type { ChatFocus } from '../types/chatFocus';
import { shouldSimulateChat, shouldUseMockData } from '../hooks/useShouldUseMockData';
import { getDemoFocusResponse, streamDemoFocusReply } from '../lib/demoFocusChat';
import {
  getGuestLoreSnapshot,
  type GuestLoreUpdates,
} from './guestLoreStore';
import { deriveTitleFromFirstUserMessage } from '../features/chat/utils/threadTitleUtils';
import type { Message } from '../features/chat/message/ChatMessage';
import type { ChatThread } from '../features/chat/hooks/useChatThreads';
import { emitDemoEffect, demoEffectMessage } from './demoMutationEffects';
import { dispatchStoryDataUpdated } from '../lib/storyRefresh';
import {
  compileChatLoreContext,
  deriveChatThreadSubtitle,
  toMessageMentionedEntities,
} from '../lib/chatLoreContext';
import { DEMO_ENTITY_FALLBACKS } from '../lib/demoEntityFallbacks';
import { CONVERSATION_SCENARIOS } from '../lib/storyForge/conversationScenarios';
import { scenariosToDemoThreads } from '../lib/storyForge/scenarioToDemoThread';
import { maybeNotedSignatureResponse } from '../lib/notedSignature';

export type DemoChatLoadingStage =
  | 'analyzing'
  | 'searching'
  | 'connecting'
  | 'reasoning'
  | 'generating';

export type DemoChatSendResult = {
  content: string;
  mentionedEntities?: Message['mentionedEntities'];
  connections?: string[];
  timelineUpdates?: string[];
  modeDecision?: Message['modeDecision'];
  subtitle?: string;
  dominantEntities?: string[];
  loreUpdates?: GuestLoreUpdates;
};

export type ChatSimulationMode = 'demo' | 'guest';

const DEMO_KNOWN_ENTITIES = DEMO_ENTITY_FALLBACKS;

function detectEntities(text: string): NonNullable<Message['mentionedEntities']> {
  const ctx = compileChatLoreContext(text, { fallbackEntities: DEMO_KNOWN_ENTITIES });
  return toMessageMentionedEntities(ctx.entities);
}

const STAGE_DELAYS: Array<{ stage: DemoChatLoadingStage; progress: number; ms: number }> = [
  { stage: 'analyzing', progress: 18, ms: 420 },
  { stage: 'searching', progress: 38, ms: 520 },
  { stage: 'connecting', progress: 58, ms: 480 },
  { stage: 'reasoning', progress: 74, ms: 440 },
  { stage: 'generating', progress: 88, ms: 360 },
];

/** Demo-only surfaces (seed threads, etc.) — not blank guest mode. */
export function isDemoChatMockup(): boolean {
  return shouldUseMockData();
}

/** Guest + demo chat — never hits OpenAI. */
export function isSimulatedChatRuntime(): boolean {
  return shouldSimulateChat();
}

export function createDemoSeedThreads(): ChatThread[] {
  return scenariosToDemoThreads(CONVERSATION_SCENARIOS);
}

/** Seed demo threads when guest demo storage is empty. */
export function seedDemoChatThreadsIfEmpty(threads: ChatThread[]): ChatThread[] {
  if (!isDemoChatMockup() || threads.length > 0) return threads;
  return createDemoSeedThreads();
}

function deriveDemoSubtitle(message: string): string {
  return deriveChatThreadSubtitle(message);
}

export function deriveDemoThreadMeta(messages: Message[]): {
  subtitle?: string;
  dominantEntities?: string[];
} {
  const recent = messages.slice(-6);
  const text = recent.map((m) => m.content).join(' ');
  const entities = detectEntities(text);
  return {
    subtitle: deriveDemoSubtitle(text),
    dominantEntities: entities.slice(0, 3).map((e) => e.name),
  };
}

function simulationLabel(mode: ChatSimulationMode): string {
  return mode === 'guest' ? 'Guest preview — simulated response' : 'Demo mode — simulated response';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function snapshotFallbackEntities(guestId?: string): typeof DEMO_ENTITY_FALLBACKS {
  if (!guestId) return [];
  const snapshot = getGuestLoreSnapshot(guestId);
  return [
    ...snapshot.characters.map((c) => ({
      pattern: new RegExp(`\\b${escapeRegex(c.name)}\\b`, 'i'),
      id: c.id,
      name: c.name,
      type: 'character' as const,
    })),
    ...snapshot.locations.map((l) => ({
      pattern: new RegExp(`\\b${escapeRegex(l.name)}\\b`, 'i'),
      id: l.id,
      name: l.name,
      type: 'location' as const,
    })),
  ];
}

/** Lexical guest-lore extraction — no LLM. */
export function extractSimulatedGuestLore(
  message: string,
  guestId?: string,
): GuestLoreUpdates {
  const snapshot = guestId ? getGuestLoreSnapshot(guestId) : { characters: [], entries: [], locations: [] };
  const lore = compileChatLoreContext(message, {
    fallbackEntities: snapshotFallbackEntities(guestId),
  });

  const characters = lore.entities
    .filter((e) => e.type === 'character')
    .map((e) => ({
      name: e.name,
      summary: `Mentioned in chat: ${message.slice(0, 120)}`,
    }));

  const locations = lore.entities
    .filter((e) => e.type === 'location')
    .map((e) => ({
      name: e.name,
      summary: `Mentioned in chat`,
    }));

  const mentionedEntities = [
    ...characters.map((c) => ({
      id: snapshot.characters.find((s) => s.name.toLowerCase() === c.name.toLowerCase())?.id ?? c.name,
      name: c.name,
      type: 'character' as const,
    })),
    ...locations.map((l) => ({
      id: snapshot.locations.find((s) => s.name.toLowerCase() === l.name.toLowerCase())?.id ?? l.name,
      name: l.name,
      type: 'location' as const,
    })),
  ];

  return {
    characters,
    locations,
    entries: message.trim()
      ? [{ content: message.trim(), summary: message.trim().slice(0, 120) }]
      : [],
    mentionedEntities,
  };
}

function buildGenericDemoResponse(
  message: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  mode: ChatSimulationMode = 'demo',
  guestId?: string,
): DemoChatSendResult {
  const fallbacks = mode === 'demo' ? DEMO_KNOWN_ENTITIES : snapshotFallbackEntities(guestId);
  const noted = maybeNotedSignatureResponse({ message, conversationHistory });
  if (noted) {
    const lore = compileChatLoreContext(message, { fallbackEntities: fallbacks });
    const entities = lore.entities;
    return {
      content: noted,
      mentionedEntities: entities.length > 0 ? toMessageMentionedEntities(entities) : undefined,
      connections: entities.length > 0 ? [`Logged ${entities.map((e) => e.name).join(', ')}`] : ['Logged to your story'],
      timelineUpdates: ['📅 Entry captured'],
      modeDecision: { mode: 'ACTION_LOG', confidence: 0.95, reasoning: 'Signature acknowledgment' },
      subtitle: deriveDemoSubtitle(message),
      dominantEntities: entities.slice(0, 3).map((e) => e.name),
    };
  }

  const lower = message.toLowerCase();
  const lore = compileChatLoreContext(message, { fallbackEntities: fallbacks });
  const entities = lore.entities;
  const names = entities.map((e) => e.name);
  const entityLine =
    names.length > 0
      ? `I picked up **${names.join('**, **')}** via ontology-backed lexical intelligence (no LLM) and would link them to your books.`
      : 'I\'m tracking themes and people as you talk — keep going and your timeline will fill in.';

  const ontologyLine =
    lore.ontologyHits.length > 0
      ? `\n\n_Lexical signals: ${lore.ontologyHits.slice(0, 4).map((h) => `${h.name} (${h.category})`).join(', ')}${lore.ontologyHits.length > 4 ? '…' : ''}_`
      : '';
  const relationshipLine =
    lore.relationshipHints.length > 0
      ? `\n_Relationship hints: ${lore.relationshipHints.slice(0, 3).join(', ')}_`
      : '';
  const priorLine =
    lore.priorMentionedNames.length > 0
      ? `\n_Thread memory: ${lore.priorMentionedNames.slice(0, 4).join(', ')}_`
      : '';

  let body: string;
  if (/remember|recall|what do you know|what did i/.test(lower)) {
    body =
      mode === 'guest'
        ? "In this guest preview I'm simulating memory recall from your temporary session lore — nothing is sent to OpenAI.\n\n" +
          entityLine
        : "In demo mode I'm simulating memory recall. I'd surface matching journal entries, characters, and timeline events tied to what you asked about.\n\n" +
          entityLine;
  } else if (/villain|character|who is|tell me about/.test(lower)) {
    body =
      "I'd extract that person into your **Characters** book with relationship context and let you confirm or refine the details.\n\n" +
      entityLine;
  } else if (/log this|save this|remember this|journal/.test(lower)) {
    body =
      'Got it — this would land in your life log and ripple into timeline, characters, and any open quests that match.\n\n' +
      entityLine;
  } else if (/feel|felt|anxious|excited|overwhelmed|happy|sad|stress/.test(lower)) {
    body =
      "I hear the emotional weight in what you're sharing. LoreBook tracks patterns like this over time — not just the event, but how it fits your longer arc.\n\n" +
      entityLine;
  } else {
    body =
      mode === 'guest'
        ? "Thanks for sharing that. This guest preview simulates how LoreBook listens and updates your temporary story — no account and no AI API calls.\n\n" +
          entityLine +
          '\n\nWhat feels most important to explore next?'
        : "Thanks for sharing that. In demo mode this simulates how LoreBook reflects back, connects dots, and updates your story surfaces without calling the server.\n\n" +
          entityLine +
          '\n\nWhat feels most important to explore next?';
  }

  const timelineUpdates =
    entities.length > 0
      ? entities.slice(0, 2).map((e) => `📅 Noted ${e.name} on your timeline`)
      : ['📅 Conversation logged to your demo timeline'];

  const loreUpdates = mode === 'guest' ? extractSimulatedGuestLore(message, guestId) : undefined;

  return {
    content: `*(${simulationLabel(mode)})*\n\n${body}${ontologyLine}${relationshipLine}${priorLine}`,
    mentionedEntities: entities.length > 0 ? toMessageMentionedEntities(entities) : undefined,
    connections: names.length > 0 ? [`Linked to ${names.join(', ')}`] : ['Added to your running conversation context'],
    timelineUpdates,
    modeDecision: { mode: 'SUPPORTIVE', confidence: 0.92, reasoning: `${mode} simulation — supportive reflection` },
    subtitle: deriveDemoSubtitle(message),
    dominantEntities: names.slice(0, 3),
    loreUpdates,
  };
}

export function buildDemoChatResponse(
  message: string,
  chatFocus?: ChatFocus,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  mode: ChatSimulationMode = 'demo',
  guestId?: string,
): DemoChatSendResult {
  if (chatFocus) {
    const content = getDemoFocusResponse(message, chatFocus);
    const entityType =
      chatFocus.entityType === 'location'
        ? 'location'
        : chatFocus.entityType === 'organization'
          ? 'organization'
          : 'character';
    return {
      content,
      mentionedEntities: [
        {
          id: chatFocus.entityId,
          name: chatFocus.entityName,
          type: entityType,
          mentionStatus: 'confirmed',
        },
      ],
      connections: [`Focused on ${chatFocus.entityName} from ${chatFocus.sourceLabel}`],
      timelineUpdates: [`📅 Deepened ${chatFocus.entityName} focus thread`],
      modeDecision: { mode: 'SOCIAL_FOCUS', confidence: 0.95, reasoning: 'Demo focus chat simulation' },
      subtitle: chatFocus.sourceLabel,
      dominantEntities: [chatFocus.entityName],
      loreUpdates: mode === 'guest' ? extractSimulatedGuestLore(message, guestId) : undefined,
    };
  }
  return buildGenericDemoResponse(message, conversationHistory, mode, guestId);
}

export async function runDemoLoadingStages(
  onStage: (stage: DemoChatLoadingStage, progress: number) => void,
): Promise<void> {
  for (const step of STAGE_DELAYS) {
    onStage(step.stage, step.progress);
    await sleep(step.ms);
  }
  onStage('generating', 100);
}

export async function simulateDemoChatSend(options: {
  message: string;
  chatFocus?: ChatFocus;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: ChatSimulationMode;
  guestId?: string;
  onStage?: (stage: DemoChatLoadingStage, progress: number) => void;
  onChunk: (chunk: string) => void;
}): Promise<DemoChatSendResult> {
  const mode = options.mode ?? (shouldUseMockData() ? 'demo' : 'guest');

  if (options.onStage) {
    await runDemoLoadingStages(options.onStage);
  }

  const result = buildDemoChatResponse(
    options.message,
    options.chatFocus,
    options.conversationHistory,
    mode,
    options.guestId,
  );
  await streamDemoFocusReply(result.content, options.onChunk, { chunkSize: 12, delayMs: 22 });

  const primaryEntity = result.mentionedEntities?.[0]?.name;
  if (primaryEntity) {
    emitDemoEffect({
      kind: 'character_saved',
      ...demoEffectMessage('character_saved', primaryEntity),
      showToast: false,
    });
  }

  dispatchStoryDataUpdated({
    scopes: ['characters', 'timeline', 'story'],
    delayMs: 800,
  });

  return result;
}

export function deriveDemoThreadTitle(firstUserMessage: string): string {
  return deriveTitleFromFirstUserMessage(firstUserMessage);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
