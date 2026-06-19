import type { ChatThread } from '../../features/chat/hooks/useChatThreads';
import type { Message } from '../../features/chat/message/ChatMessage';
import {
  compileChatLoreContext,
  deriveChatThreadSubtitle,
  toMessageMentionedEntities,
} from '../chatLoreContext';
import { DEMO_ENTITY_FALLBACKS } from '../demoEntityFallbacks';
import type { ConversationScenario } from './types';

function daysAgo(days: number, hours = 12): string {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

function entitiesForTurn(
  content: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Message['mentionedEntities'] {
  const lore = compileChatLoreContext(content, {
    conversationHistory: history,
    fallbackEntities: DEMO_ENTITY_FALLBACKS,
  });
  const entities = toMessageMentionedEntities(lore.entities);
  return entities.length > 0 ? entities : undefined;
}

/** Turn a Story Forge scenario into a demo chat thread with entity mentions on each message. */
export function scenarioToDemoThread(
  scenario: ConversationScenario,
  options?: { dayOffset?: number }
): ChatThread {
  const dayOffset = options?.dayOffset ?? 0;
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const messages: Message[] = [];

  scenario.turns.forEach((turn, index) => {
    const mentionedEntities = entitiesForTurn(turn.content, history);
    history.push({ role: turn.role, content: turn.content });

    messages.push({
      id: `demo-${scenario.id}-${index}`,
      role: turn.role,
      content: turn.content,
      timestamp: new Date(daysAgo(dayOffset, 24 - index * 2)),
      persistStatus: 'saved',
      mentionedEntities,
    });
  });

  const combined = scenario.turns.map((t) => t.content).join(' ');
  const subtitle = deriveChatThreadSubtitle(combined);
  const dominantEntities = compileChatLoreContext(combined, {
    fallbackEntities: DEMO_ENTITY_FALLBACKS,
  })
    .entities.slice(0, 3)
    .map((e) => e.name);

  return {
    id: `demo-thread-${scenario.id}`,
    title: scenario.title,
    subtitle: subtitle || scenario.subtitle,
    dominantEntities,
    updatedAt: daysAgo(dayOffset, 1),
    messageCount: messages.length,
    messages,
  };
}

export function scenariosToDemoThreads(
  scenarios: ConversationScenario[],
  options?: { maxThreads?: number }
): ChatThread[] {
  const slice = options?.maxThreads ? scenarios.slice(0, options.maxThreads) : scenarios;
  return slice.map((scenario, index) =>
    scenarioToDemoThread(scenario, { dayOffset: slice.length - index })
  );
}
