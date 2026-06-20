import { fetchJson } from '../lib/api';

export type CharacterLoreItem = {
  id: string;
  label: string;
  category?: string;
  confidence?: number;
  evidence?: string;
  source: 'chat' | 'inferred' | 'user';
  lastMentionedAt?: string;
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
  skills: CharacterLoreItem[];
  hobbies: CharacterLoreItem[];
  interests: CharacterLoreItem[];
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
