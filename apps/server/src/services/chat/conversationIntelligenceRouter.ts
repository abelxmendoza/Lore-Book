/**
 * Sprint AK — Conversation Intelligence Router
 *
 * Routes classified question intents to evidence-backed handlers.
 */

import { classifyQuestionIntent, extractPersonNameFromIntent, extractSceneQuery } from './questionIntentClassifier';
import { formatEvidenceResponse, hasAnyEvidence, type EvidenceCounts } from './memoryEvidenceFormatter';
import { formatLabeledRecall } from './memorySourceLabels';
import { buildThreadRecall } from './threadRecallService';
import { fetchEntityProfile } from './foundationRecallDataService';
import { getMemoryFormationStatus } from './memoryFormationStatusService';
import { verifyCharacterCreation } from './characterCreationVerification';
import { buildMemoryDebugReport } from './memoryDebugMode';
import { sanitizeAssistantResponse, getRecentAssistantMessages } from './antiRepetitionLayer';
import {
  buildPersonStoryRecall,
  buildSceneRecall,
  buildEventStoryRecall,
  buildStoryRosterRecall,
} from '../story/storyRecallService';
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
  const storyContent = await buildPersonStoryRecall(userId, name, {
    threadId: options.threadId,
    conversationHistory: options.conversationHistory,
  });

  if (storyContent) {
    const profile = await fetchEntityProfile(userId, name);
    const evidence: EvidenceCounts = {
      thread: options.conversationHistory.some(
        (m) => m.role === 'user' && m.content.toLowerCase().includes(name.toLowerCase())
      )
        ? 1
        : 0,
      memory: profile?.memoryCount ?? 0,
      event: profile?.timelineEvents.length ?? 0,
      character: profile ? 1 : 0,
    };

    return {
      handled: true,
      content: storyContent,
      response_mode: 'STORY_RECALL',
      confidence: hasAnyEvidence(evidence) ? 0.95 : 0.7,
      metadata: { am_intent: 'person_story', entity_name: name, evidence },
    };
  }

  const profile = await fetchEntityProfile(userId, name);
  const evidence: EvidenceCounts = {
    thread: 0,
    memory: profile?.memoryCount ?? 0,
    event: profile?.timelineEvents.length ?? 0,
    character: profile ? 1 : 0,
  };

  const evidenceBlock = formatEvidenceResponse({
    known: profile ? [`Character "${profile.name}" exists`] : [],
    unknown: profile ? [] : [`No story reconstructed for "${name}"`],
    evidence,
  });

  return {
    handled: true,
    content: evidenceBlock,
    response_mode: 'DIAGNOSTIC',
    confidence: 0.4,
    metadata: { am_intent: 'person_story_empty', entity_name: name, evidence },
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
    case 'scene_recall': {
      const content = await buildSceneRecall(userId, message, options);
      result = {
        handled: !!content,
        content: content ?? '',
        response_mode: 'STORY_RECALL',
        confidence: content ? 0.95 : 0,
        metadata: { am_intent: 'scene_recall', query: extractSceneQuery(message) },
      };
      break;
    }
    case 'event_story': {
      const subject =
        extractPersonNameFromIntent(message, intent) ??
        extractSceneQuery(message) ??
        message.replace(/\bwhat happened (?:with|at|to)\s+/i, '').replace(/[?.!]+$/, '').trim();
      const content = await buildEventStoryRecall(userId, subject);
      result = {
        handled: !!content,
        content: content ?? '',
        response_mode: 'STORY_RECALL',
        confidence: content ? 0.95 : 0,
        metadata: { am_intent: 'event_story', subject },
      };
      break;
    }
    case 'story_roster': {
      const content = await buildStoryRosterRecall(userId);
      result = {
        handled: true,
        content,
        response_mode: 'STORY_RECALL',
        confidence: 0.95,
        metadata: { am_intent: 'story_roster' },
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
