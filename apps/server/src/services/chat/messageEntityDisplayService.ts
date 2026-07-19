/**
 * Resolves entities detected in a chat message for UI display.
 * Replaces legacy people_places substring matching with book + omega lookups.
 *
 * Mentions are classified before return: GENERIC/IGNORE never surface as chips.
 * A mention is evidence; only RESOLVED identities belong on Cast.
 */
import { decideIdentityLifecycle } from '../actors/identityLifecycleService';
import type { IdentityStage } from '../actors/identityLifecycleTypes';
import {
  classifyMention,
  mayAppearAsTranscriptMention,
  type MentionStatus,
} from '../actors/mentionClassifier';
import { supabaseAdmin } from '../supabaseClient';
import { detectMentionedEntities } from './entityScopedRetriever';

export type MessageEntityChip = {
  id: string;
  name: string;
  type: 'character' | 'location' | 'organization';
  confidence: number;
  provenance: 'character_book' | 'location_book' | 'organization_book' | 'omega_entity';
  mentionStatus?: 'confirmed' | 'mentioned_only';
  /** Mention lifecycle status — Cast only uses RESOLVED. */
  lifecycleStatus?: MentionStatus;
  /** Identity lifecycle stage (historian ladder). */
  identityStage?: IdentityStage;
  /** 0–100 identity confidence for UI. */
  identityConfidence?: number;
};

const OMEGA_TYPE_MAP: Record<string, MessageEntityChip['type']> = {
  PERSON: 'character',
  CHARACTER: 'character',
  LOCATION: 'location',
  ORG: 'organization',
};

function messageContainsName(message: string, name: string): boolean {
  if (!name || name.length < 2) return false;
  return message.toLowerCase().includes(name.toLowerCase());
}

export async function resolveMessageEntitiesForDisplay(
  userId: string,
  message: string
): Promise<MessageEntityChip[]> {
  const [{ data: characters }, { data: locations }, { data: organizations }, { data: omegaRows }] =
    await Promise.all([
      supabaseAdmin.from('characters').select('id, name, alias').eq('user_id', userId).limit(500),
      supabaseAdmin.from('locations').select('id, name').eq('user_id', userId).limit(200),
      supabaseAdmin.from('organizations').select('id, name').eq('user_id', userId).limit(200),
      supabaseAdmin
        .from('omega_entities')
        .select('id, name, type, mention_status, mention_count')
        .eq('user_id', userId)
        .limit(500),
    ]);

  const chips = new Map<string, MessageEntityChip>();

  for (const hit of detectMentionedEntities(message, characters ?? [], locations ?? [])) {
    chips.set(hit.id, {
      id: hit.id,
      name: hit.name,
      type: hit.type,
      confidence: hit.matchScore,
      provenance: hit.type === 'character' ? 'character_book' : 'location_book',
    });
  }

  for (const org of organizations ?? []) {
    if (!org.name || !messageContainsName(message, org.name)) continue;
    chips.set(org.id, {
      id: org.id,
      name: org.name,
      type: 'organization',
      confidence: 1.0,
      provenance: 'organization_book',
    });
  }

  for (const row of omegaRows ?? []) {
    if (!row.name || !messageContainsName(message, row.name)) continue;
    const type = OMEGA_TYPE_MAP[String(row.type ?? '').toUpperCase()];
    if (!type) continue;

    const mentionCount = Number(row.mention_count ?? 1);
    const confidence = Math.min(0.95, 0.55 + mentionCount * 0.15);
    const status = row.mention_status === 'confirmed' ? 'confirmed' : 'mentioned_only';

    const existing = [...chips.values()].find(
      (c) => c.name.toLowerCase() === row.name.toLowerCase() && c.type === type
    );
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.mentionStatus = status;
      continue;
    }

    chips.set(`omega:${row.id}`, {
      id: row.id,
      name: row.name,
      type,
      confidence,
      provenance: 'omega_entity',
      mentionStatus: status,
    });
  }

  const classified: MessageEntityChip[] = [];
  for (const chip of chips.values()) {
    const mention = classifyMention({
      text: chip.name,
      entityId: chip.id,
      provenance: chip.provenance,
      mentionStatus: chip.mentionStatus,
      kind: chip.type,
    });
    if (!mayAppearAsTranscriptMention(mention)) continue;
    const identity = decideIdentityLifecycle({
      name: chip.name,
      mention,
      signals: {
        mentionCount: chip.provenance === 'character_book' ? 2 : 1,
        conversationCount: chip.provenance === 'character_book' ? 2 : 1,
        timeSpanDays: 0,
        namedExplicitly: mention.status === 'RESOLVED',
        baseConfidence: chip.confidence,
      },
    });
    classified.push({
      ...chip,
      confidence: Math.min(chip.confidence, mention.confidence + 0.2),
      lifecycleStatus: mention.status,
      identityStage: identity.stage,
      identityConfidence: identity.identityConfidence,
    });
  }

  return classified.sort((a, b) => b.confidence - a.confidence);
}
