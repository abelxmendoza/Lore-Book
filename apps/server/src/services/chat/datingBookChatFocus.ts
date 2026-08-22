import { supabaseAdmin } from '../supabaseClient';

export const DATING_ROMANCE_KNOWLEDGE_SCOPE =
  'romantic interest, shared history, feelings, and relationship context';

export type ChatFocusLike = {
  entityId: string;
  entityName: string;
  entityType: string;
  sourceSurface: string;
  sourceLabel: string;
  relationshipId?: string;
  relationshipName?: string;
  knowledgeScope?: string;
  baseline?: {
    affectionScore?: number;
    connectionScore?: number;
    healthScore?: number;
  };
};

export type DatingBookRelationshipFocus = {
  relationshipId: string;
  personName: string;
  affectionScore: number;
  healthScore: number;
  connectionScore: number;
};

export function isDatingRomanceChatFocus(focus: {
  sourceSurface?: string;
  relationshipId?: string;
  knowledgeScope?: string;
}): boolean {
  if (focus.sourceSurface === 'love') return true;
  if (focus.relationshipId) return true;
  return /\bromantic\b/i.test(focus.knowledgeScope ?? '');
}

export function applyDatingBookFocus<T extends ChatFocusLike>(
  chatFocus: T,
  dating: DatingBookRelationshipFocus,
): T {
  return {
    ...chatFocus,
    relationshipId: chatFocus.relationshipId ?? dating.relationshipId,
    relationshipName: chatFocus.relationshipName ?? dating.personName ?? chatFocus.entityName,
    sourceSurface: 'love',
    sourceLabel: 'Dating & Romance',
    knowledgeScope:
      chatFocus.knowledgeScope && /\bromantic\b/i.test(chatFocus.knowledgeScope)
        ? chatFocus.knowledgeScope
        : DATING_ROMANCE_KNOWLEDGE_SCOPE,
    baseline: {
      affectionScore: chatFocus.baseline?.affectionScore ?? Math.round(dating.affectionScore * 100),
      healthScore: chatFocus.baseline?.healthScore ?? Math.round(dating.healthScore * 100),
      connectionScore: chatFocus.baseline?.connectionScore ?? Math.round(dating.connectionScore * 100),
    },
  };
}

export async function findDatingBookRelationshipForCharacter(
  userId: string,
  characterId: string,
): Promise<DatingBookRelationshipFocus | null> {
  if (!userId || !characterId) return null;
  const { data, error } = await supabaseAdmin
    .from('romantic_relationships')
    .select('id, person_name, affection_score, relationship_health, emotional_intensity, is_current')
    .eq('user_id', userId)
    .eq('person_type', 'character')
    .eq('person_id', characterId)
    .order('is_current', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    id?: unknown;
    person_name?: string | null;
    affection_score?: number | null;
    relationship_health?: number | null;
    emotional_intensity?: number | null;
  };
  if (typeof row.id !== 'string' || !row.id) return null;
  // Real PostgREST returns the selected score columns (null or number).
  // Test doubles often stub every table as `{ id }` — those are not dating rows.
  if (!('affection_score' in row) && !('person_name' in row)) return null;
  return {
    relationshipId: row.id,
    personName: row.person_name?.trim() || '',
    affectionScore: row.affection_score ?? 0,
    healthScore: row.relationship_health ?? 0,
    connectionScore: row.emotional_intensity ?? 0,
  };
}

export async function enrichChatFocusWithDatingBook<T extends ChatFocusLike>(
  userId: string,
  chatFocus: T | undefined,
  focusedCharacterId?: string | null,
): Promise<T | undefined> {
  if (!chatFocus) return chatFocus;
  const characterId =
    chatFocus.entityType === 'character' ? chatFocus.entityId : focusedCharacterId ?? null;
  if (!characterId) return chatFocus;
  if (isDatingRomanceChatFocus(chatFocus) && chatFocus.relationshipId) return chatFocus;
  const dating = await findDatingBookRelationshipForCharacter(userId, characterId);
  if (!dating) return chatFocus;
  return applyDatingBookFocus(chatFocus, dating);
}
