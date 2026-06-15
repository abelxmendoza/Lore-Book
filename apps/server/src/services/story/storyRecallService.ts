/**
 * Sprint AM — Story recall orchestration
 *
 * Wires scene reconstruction, memory profiles, event stories, and conflicts.
 */

import {
  reconstructSceneByPerson,
  reconstructSceneByPlace,
  formatSceneForChat,
} from '../story/sceneReconstructionService';
import {
  buildCharacterMemoryProfile,
  formatCharacterMemoryProfileForChat,
} from '../characters/characterMemoryProfileService';
import {
  reconstructEventByQuery,
  formatEventReconstructionForChat,
} from '../story/eventReconstructionService';
import {
  buildRelationshipStory,
  formatRelationshipStoryForChat,
} from '../story/relationshipStoryBuilder';
import { detectNameConflicts, formatConflictWarning } from '../story/entityConflictResolver';
import { formatStoryRosterForChat } from '../chat/foundationRecallDataService';
import { extractSceneQuery } from '../chat/questionIntentClassifier';

type HistoryMessage = { role: string; content: string };

export async function buildPersonStoryRecall(
  userId: string,
  name: string,
  options: { threadId?: string; conversationHistory?: HistoryMessage[] } = {}
): Promise<string | null> {
  const [profile, scene, conflicts, relStory] = await Promise.all([
    buildCharacterMemoryProfile(userId, name),
    reconstructSceneByPerson(userId, name, { threadId: options.threadId }),
    detectNameConflicts(userId, name),
    buildRelationshipStory(userId, name),
  ]);

  const parts: string[] = [];

  const conflictBlock = formatConflictWarning(conflicts);
  if (conflictBlock) parts.push(conflictBlock);

  if (profile) {
    parts.push(formatCharacterMemoryProfileForChat(profile, name));
  } else if (scene) {
    parts.push(formatSceneForChat(scene));
  } else {
    return null;
  }

  if (scene && profile) {
    parts.push('', '---', '', formatSceneForChat(scene));
  }

  if (relStory && relStory.facts.length > 1) {
    parts.push('', '---', '', formatRelationshipStoryForChat(relStory));
  }

  return parts.filter(Boolean).join('\n');
}

export async function buildSceneRecall(
  userId: string,
  message: string,
  options: { threadId?: string } = {}
): Promise<string | null> {
  const query = extractSceneQuery(message);
  if (!query) return null;

  const isPersonQuery = /^t[ií]a\s|^(jerry|james|ashley|sol|kelly|abuela)/i.test(query);

  if (isPersonQuery) {
    const scene = await reconstructSceneByPerson(userId, query, options);
    if (scene) return formatSceneForChat(scene);
  }

  const scene = await reconstructSceneByPlace(userId, query, options);
  if (scene) return formatSceneForChat(scene);

  const personScene = await reconstructSceneByPerson(userId, query, options);
  if (personScene) return formatSceneForChat(personScene);

  const event = await reconstructEventByQuery(userId, query);
  if (event) return formatEventReconstructionForChat(event);

  return null;
}

export async function buildEventStoryRecall(
  userId: string,
  subject: string
): Promise<string | null> {
  const event = await reconstructEventByQuery(userId, subject);
  if (event) return formatEventReconstructionForChat(event);

  const rel = await buildRelationshipStory(userId, subject);
  if (rel) return formatRelationshipStoryForChat(rel);

  return buildPersonStoryRecall(userId, subject);
}

export async function buildStoryRosterRecall(userId: string): Promise<string> {
  return formatStoryRosterForChat(userId);
}
