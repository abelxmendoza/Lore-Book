/**
 * Classify source text before it becomes a timeline event.
 * Commands / product tests / recaps must not become life chapters.
 */

import {
  classifyIngestionScope,
  isPureMetaProductMessage,
} from '../chat/metaConversationClassifier';
import type { SourceSpeechAct } from './types';

const COMMAND_PATTERNS: RegExp[] = [
  /^(recap|summarize|review|list|show|tell me)\b/i,
  /\brecap (everything|all|this thread|our conversation)\b/i,
  /\b(what did we|what have we) (discuss|talk|cover)/i,
  /\b(test(ing)?|retry|try again|run again)\b/i,
  /\btesting (the |this )?(chat|app|improvements|lorebook)\b/i,
  /\b(token spam|tokens getting spammed|check (my )?tokens)\b/i,
  /\byou (completely )?failed\b/i,
  /\bthat was a failed\b/i,
  /\b(please )?(save|remember|forget|delete|update) (this|that|it)\b/i,
  /\b(can you|could you|will you|please) (recap|summarize|list|test)\b/i,
];

const CONVERSATION_MGMT: RegExp[] = [
  /\ba recap thread\b/i,
  /\bthis thread\b/i,
  /\bcontinue (the |this )?conversation\b/i,
  /\bstart over\b/i,
  /\bnew (chat|thread|conversation)\b/i,
];

const ERROR_PATTERNS: RegExp[] = [
  /\b(error|exception|stack trace|failed to|http \d{3})\b/i,
  /\b(rate limit|timeout|crash)\b/i,
];

const PROJECT_WORK_PATTERNS: RegExp[] = [
  /\b(i |we )?(spent|worked|coded|built|shipped|debugged|fixed|tested).{0,40}\b(lore\s?book|app|feature|pipeline|chat)\b/i,
  /\b(all day|hours?) (building|coding|working on) (lore\s?book|the app)\b/i,
  /\b(development|coding) session\b/i,
  /\bfixed .{0,40}(bug|rendering|character|token)\b/i,
];

const LIFE_EVENT_PATTERNS: RegExp[] = [
  /\b(i |we )?(went|visited|attended|met|drove|flew|started|quit|hired|broke up|moved)\b/i,
  /\b(yesterday|today|last (night|week|month)|this morning)\b/i,
  /\b(at |to )(the )?(lab|office|show|concert|costco|park|club)\b/i,
];

const QUESTION_PATTERNS: RegExp[] = [
  /^(what|why|how|when|where|who|do you|can you|should i)\b/i,
  /\?$/,
];

export type SpeechActResult = {
  act: SourceSpeechAct;
  rejectFromTimeline: boolean;
  reason?: string;
};

export function classifySourceSpeechAct(text: string): SpeechActResult {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return { act: 'conversation_management', rejectFromTimeline: true, reason: 'empty' };
  }

  if (ERROR_PATTERNS.some((p) => p.test(trimmed)) && trimmed.length < 120) {
    return { act: 'error_message', rejectFromTimeline: true, reason: 'error_message' };
  }

  if (COMMAND_PATTERNS.some((p) => p.test(trimmed)) || isPureMetaProductMessage(trimmed)) {
    // Allow grounded project work even if product is mentioned
    if (PROJECT_WORK_PATTERNS.some((p) => p.test(trimmed))) {
      return { act: 'project_work', rejectFromTimeline: false };
    }
    return { act: 'command', rejectFromTimeline: true, reason: 'command_or_meta' };
  }

  if (CONVERSATION_MGMT.some((p) => p.test(trimmed))) {
    return {
      act: 'conversation_management',
      rejectFromTimeline: true,
      reason: 'conversation_management',
    };
  }

  if (PROJECT_WORK_PATTERNS.some((p) => p.test(trimmed))) {
    return { act: 'project_work', rejectFromTimeline: false };
  }

  const scope = classifyIngestionScope(trimmed);
  if (scope === 'product_only') {
    return { act: 'product_test', rejectFromTimeline: true, reason: 'product_only' };
  }

  if (QUESTION_PATTERNS.some((p) => p.test(trimmed)) && !LIFE_EVENT_PATTERNS.some((p) => p.test(trimmed))) {
    return { act: 'question', rejectFromTimeline: true, reason: 'pure_question' };
  }

  if (LIFE_EVENT_PATTERNS.some((p) => p.test(trimmed))) {
    return { act: 'life_event', rejectFromTimeline: false };
  }

  if (/\b(i feel|i felt|thinking about|reflecting)\b/i.test(trimmed)) {
    return { act: 'reflection', rejectFromTimeline: false };
  }

  if (/\b(i (want|plan|hope|will|gonna))\b/i.test(trimmed)) {
    return { act: 'goal_or_plan', rejectFromTimeline: false };
  }

  // Short fragment / title-like debris without occurrence verbs
  if (trimmed.length < 28 && !/\b(day|night|trip|show|party|interview|onboarding)\b/i.test(trimmed)) {
    return {
      act: 'conversation_management',
      rejectFromTimeline: true,
      reason: 'thin_fragment',
    };
  }

  return { act: 'life_event', rejectFromTimeline: false };
}

/** True when content must not become a default timeline event/chapter. */
export function shouldRejectFromTimeline(text: string): boolean {
  return classifySourceSpeechAct(text).rejectFromTimeline;
}
