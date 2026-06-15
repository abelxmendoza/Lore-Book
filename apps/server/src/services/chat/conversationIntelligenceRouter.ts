/**
 * Sprint AK — Conversation Intelligence Router
 *
 * Routes classified question intents to evidence-backed handlers.
 */

import { classifyQuestionIntent, extractPersonNameFromIntent } from './questionIntentClassifier';
import { formatEvidenceResponse, hasAnyEvidence, type EvidenceCounts } from './memoryEvidenceFormatter';
import { formatLabeledRecall } from './memorySourceLabels';
import { buildThreadRecall } from './threadRecallService';
import { fetchEntityProfile, formatEntityProfileForChat } from './foundationRecallDataService';
import { getMemoryFormationStatus } from './memoryFormationStatusService';
import { verifyCharacterCreation } from './characterCreationVerification';
import { buildMemoryDebugReport } from './memoryDebugMode';
import { formatStoryInsightBlock } from './storyInsightService';
import { sanitizeAssistantResponse, getRecentAssistantMessages } from './antiRepetitionLayer';
import { supabaseAdmin } from '../supabaseClient';

type HistoryMessage = { role: string; content: string };

export type ConversationIntelligenceResult = {
  handled: boolean;
  content: string;
  response_mode: string;
  confidence: number;
  metadata?: Record<string, unknown>;
};

async function buildPersonRecall(
  userId: string,
  name: string,
  options: { conversationHistory: HistoryMessage[]; threadId?: string }
): Promise<ConversationIntelligenceResult> {
  const threadText = options.conversationHistory
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  const profile = await fetchEntityProfile(userId, name);
  const threadMentions = threadText.toLowerCase().includes(name.toLowerCase()) ? 1 : 0;

  const known: string[] = [];
  const unknown: string[] = [];

  if (threadMentions) {
    known.push(`Mentioned in current thread`);
  } else {
    unknown.push(`Not mentioned in current thread`);
  }

  if (profile) {
    known.push(`Character "${profile.name}" in database`);
    if (profile.memoryCount > 0) known.push(`${profile.memoryCount} linked memory(ies)`);
    if (profile.relationshipToUser) known.push(`Relationship: ${profile.relationshipToUser}`);
    for (const fact of profile.facts.slice(0, 4)) known.push(fact);
  } else {
    unknown.push(`No character record for "${name}"`);
  }

  const evidence: EvidenceCounts = {
    thread: threadMentions,
    memory: profile?.memoryCount ?? 0,
    event: profile?.timelineEvents.length ?? 0,
    character: profile ? 1 : 0,
  };

  const storedLore = profile
    ? formatEntityProfileForChat(profile, { threadText })
    : null;

  const insight = formatStoryInsightBlock([
    ...options.conversationHistory.filter((m) => m.role === 'user').map((m) => m.content),
    ...(profile?.facts ?? []),
  ]);

  const labeled = formatLabeledRecall({
    currentThread: threadMentions
      ? options.conversationHistory
          .filter((m) => m.role === 'user' && m.content.toLowerCase().includes(name.toLowerCase()))
          .map((m) => m.content.slice(0, 200))
          .join('\n')
      : null,
    storedLore,
  });

  const evidenceBlock = formatEvidenceResponse({ known, unknown, evidence });
  const content = [labeled, insight, evidenceBlock].filter(Boolean).join('\n\n');

  return {
    handled: true,
    content,
    response_mode: profile ? 'RECALL' : 'DIAGNOSTIC',
    confidence: hasAnyEvidence(evidence) ? 0.9 : 0.4,
    metadata: { ak_intent: 'recall_person', entity_name: name, evidence },
  };
}

async function buildPersonProfile(
  userId: string,
  name: string,
  options: { conversationHistory: HistoryMessage[]; threadId?: string }
): Promise<ConversationIntelligenceResult> {
  return buildPersonRecall(userId, name, options);
}

async function buildDailyRecall(
  userId: string,
  message: string,
  options: { conversationHistory: HistoryMessage[]; threadId?: string }
): Promise<ConversationIntelligenceResult> {
  const thread = await buildThreadRecall(userId, message, options);

  const { data: events } = await supabaseAdmin
    .from('character_timeline_events')
    .select('event_title, event_date')
    .eq('user_id', userId)
    .gte('event_date', new Date().toISOString().slice(0, 10))
    .order('event_date', { ascending: false })
    .limit(5);

  const recentEvents =
    events?.length
      ? events.map((e) => `• ${e.event_title}${e.event_date ? ` (${e.event_date})` : ''}`).join('\n')
      : null;

  const labeled = formatLabeledRecall({
    currentThread: thread.content,
    recentEvents,
  });

  const evidence: EvidenceCounts = {
    thread: thread.hasContent ? 1 : 0,
    memory: 0,
    event: events?.length ?? 0,
    character: 0,
  };

  const evidenceBlock = formatEvidenceResponse({
    known: thread.hasContent ? ['Thread content available for today'] : [],
    unknown: thread.hasContent ? [] : ['No thread activity recorded for today'],
    evidence,
  });

  return {
    handled: true,
    content: [labeled, evidenceBlock].join('\n\n'),
    response_mode: 'THREAD_RECALL',
    confidence: thread.confidence,
    metadata: { ak_intent: 'daily_recall', evidence },
  };
}

export async function routeConversationIntelligence(
  userId: string,
  message: string,
  options: {
    conversationHistory: HistoryMessage[];
    threadId?: string;
  }
): Promise<ConversationIntelligenceResult> {
  const intent = classifyQuestionIntent(message);
  if (!intent) {
    return { handled: false, content: '', response_mode: 'UNKNOWN', confidence: 0 };
  }

  let result: ConversationIntelligenceResult;

  switch (intent) {
    case 'recall_person': {
      const name = extractPersonNameFromIntent(message, intent);
      if (!name) {
        return { handled: false, content: '', response_mode: 'UNKNOWN', confidence: 0 };
      }
      result = await buildPersonRecall(userId, name, options);
      break;
    }
    case 'person_profile': {
      const name = extractPersonNameFromIntent(message, intent);
      if (!name) {
        return { handled: false, content: '', response_mode: 'UNKNOWN', confidence: 0 };
      }
      result = await buildPersonProfile(userId, name, options);
      break;
    }
    case 'daily_recall':
      result = await buildDailyRecall(userId, message, options);
      break;
    case 'thread_recall': {
      const thread = await buildThreadRecall(userId, message, options);
      result = {
        handled: true,
        content: formatLabeledRecall({ currentThread: thread.content }),
        response_mode: 'THREAD_RECALL',
        confidence: thread.confidence,
        metadata: { ak_intent: 'thread_recall' },
      };
      break;
    }
    case 'memory_verification': {
      const status = await getMemoryFormationStatus(userId, message, {
        threadId: options.threadId,
      });
      result = {
        handled: true,
        content: status.content,
        response_mode: 'DIAGNOSTIC',
        confidence: 0.95,
        metadata: { ak_intent: 'memory_verification', entity_name: status.entityName },
      };
      break;
    }
    case 'character_creation_check': {
      const verification = await verifyCharacterCreation(userId, message, {
        threadId: options.threadId,
      });
      result = {
        handled: true,
        content: verification.content,
        response_mode: 'DIAGNOSTIC',
        confidence: 0.95,
        metadata: { ak_intent: 'character_creation_check', entity_name: verification.entityName },
      };
      break;
    }
    case 'memory_debug': {
      const debug = await buildMemoryDebugReport(userId, message, options);
      result = {
        handled: true,
        content: debug,
        response_mode: 'DIAGNOSTIC',
        confidence: 0.95,
        metadata: { ak_intent: 'memory_debug' },
      };
      break;
    }
    default:
      return { handled: false, content: '', response_mode: 'UNKNOWN', confidence: 0 };
  }

  const recent = getRecentAssistantMessages(options.conversationHistory);
  result.content = sanitizeAssistantResponse(result.content, recent);

  return result;
}

export { classifyQuestionIntent };
