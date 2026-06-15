/**
 * Sprint AK-5 — Therapist suppression rules
 *
 * Do not route to therapist when user is testing, recalling, stating facts, or debugging.
 */

import type { ConversationIntent } from './questionIntentClassifier';
import { detectTestingMode } from './testingModeDetector';
import { matchesFoundationRecallQuery } from './recallIntentPatterns';

const FACT_DESCRIPTION_RE =
  /\b(makes sure|always|usually|every (day|week|morning|friday)|lives with|works at|cost \d|bootcamp|lorebook|lore book|character book|testing|debug)\b/i;

const SOFTWARE_DISCUSSION_RE =
  /\b(lorebook|lore book|the app|this app|chat (is|was)|memory formation|extraction|pipeline|database|did you save|did you create)\b/i;

const CARETAKER_FACT_RE =
  /\b(makes sure i (eat|sleep|rest)|takes care of|checks on me|feeds me|looks after)\b/i;

export function shouldSuppressTherapist(
  message: string,
  intent?: ConversationIntent | null
): boolean {
  const text = message.trim();
  if (!text) return false;

  if (detectTestingMode(text)) return true;
  if (matchesFoundationRecallQuery(text)) return true;
  if (SOFTWARE_DISCUSSION_RE.test(text)) return true;
  if (FACT_DESCRIPTION_RE.test(text)) return true;
  if (CARETAKER_FACT_RE.test(text)) return true;

  if (intent) {
    return [
      'recall_person',
      'person_profile',
      'daily_recall',
      'thread_recall',
      'memory_verification',
      'character_creation_check',
      'memory_debug',
    ].includes(intent);
  }

  return false;
}

export function shouldPreferBiographyWriter(message: string): boolean {
  const text = message.trim();
  return (
    CARETAKER_FACT_RE.test(text) ||
    /\b(my (abuela|grandmother|tío|tia|uncle|aunt|family)|with abuela|costco with)\b/i.test(text) ||
    (FACT_DESCRIPTION_RE.test(text) && !/\b(i feel|i'm feeling|worried|scared|anxious|overwhelmed)\b/i.test(text))
  );
}
