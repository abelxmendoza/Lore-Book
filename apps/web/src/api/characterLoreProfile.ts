import { fetchJson } from '../lib/api';

export type CharacterLoreItem = {
  id: string;
  label: string;
  category?: string;
  confidence?: number;
  evidence?: string;
  source: 'chat' | 'inferred' | 'user';
  lastMentionedAt?: string;
  attributionReason?: string;
  attributionLabel?: string;
  subjectStance?: 'self' | 'other_person' | 'shared' | 'dismissed' | string;
};

export type CharacterPersonAssociation = {
  characterId: string | null;
  name: string;
  relationshipType: string;
  associationKind: 'direct' | 'mentioned' | 'inferred' | 'peripheral';
  hasMet: boolean | null;
  proximityLevel: string | null;
  summary?: string;
  closenessScore?: number;
  evidence?: string;
  domain?: string;
};

export type CharacterGroupAssociation = {
  organizationId: string;
  name: string;
  type?: string;
  role?: string;
  userRelationship?: string;
};

export type CharacterLoreProfile = {
  characterId: string;
  characterName: string;
  generatedAt: string;
  /** self = your lore; other = their lore as it pertains to your story */
  loreSubject?: 'self' | 'other';
  skills: CharacterLoreItem[];
  hobbies: CharacterLoreItem[];
  interests: CharacterLoreItem[];
  /** Removed by you — restorable; chats will not silently re-add. */
  removedHobbies?: CharacterLoreItem[];
  groups: CharacterGroupAssociation[];
  people: CharacterPersonAssociation[];
  loreSnippets: CharacterLoreItem[];
  mentionOnly: boolean;
};

export async function fetchCharacterLoreProfile(characterId: string): Promise<CharacterLoreProfile | null> {
  const res = await fetchJson<{ success: boolean; profile: CharacterLoreProfile }>(
    `/api/characters/${encodeURIComponent(characterId)}/lore-profile`,
  );
  return res.success ? res.profile : null;
}

/** Unlink a hobby/interest from this character (keeps the global interest list). */
export async function unlinkCharacterLoreItem(
  characterId: string,
  item: Pick<CharacterLoreItem, 'id' | 'label'>,
): Promise<{ success: boolean; learned?: boolean; message?: string }> {
  const qs = item.label ? `?label=${encodeURIComponent(item.label)}` : '';
  const res = await fetchJson<{ success: boolean; learned?: boolean; message?: string }>(
    `/api/characters/${encodeURIComponent(characterId)}/lore-items/${encodeURIComponent(item.id)}${qs}`,
    { method: 'DELETE' },
  );
  return { success: Boolean(res.success), learned: res.learned, message: res.message };
}

/** Restore a previously dismissed hobby/interest on this character. */
export async function restoreCharacterLoreItem(
  characterId: string,
  item: Pick<CharacterLoreItem, 'id' | 'label'>,
): Promise<boolean> {
  const res = await fetchJson<{ success: boolean }>(
    `/api/characters/${encodeURIComponent(characterId)}/lore-items/${encodeURIComponent(item.id)}/restore`,
    { method: 'POST', body: JSON.stringify({ label: item.label }) },
  );
  return Boolean(res.success);
}

/** Repair first-person interests wrongly linked to this character via co-mention. */
export async function repairCharacterLoreAttribution(
  characterId: string,
  opts?: { dryRun?: boolean },
): Promise<{
  success: boolean;
  repairedInterests: number;
  unlinkedPairs: number;
  details: Array<{ interestName: string; removedCharacterIds: string[] }>;
} | null> {
  const res = await fetchJson<{
    success: boolean;
    repairedInterests: number;
    unlinkedPairs: number;
    details: Array<{ interestName: string; removedCharacterIds: string[] }>;
  }>(`/api/characters/${encodeURIComponent(characterId)}/lore-items/repair-attribution`, {
    method: 'POST',
    body: JSON.stringify({ dryRun: opts?.dryRun === true }),
  });
  return res.success ? res : null;
}
