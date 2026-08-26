import { fetchJson } from '../lib/api';
import type { CharacterBookQueryRequest, CharacterBookQueryResponse } from '../lib/api-contracts';

export type CharacterProfile = {
  id: string;
  name: string;
  portraitUrl?: string;
  avatar_url?: string | null;
  pronouns?: string;
  bio?: string;
  traits?: string[];
};

export type RelationshipEdge = {
  source: string;
  target: string;
  weight: number;
  label?: string;
};

export type CharacterMemory = {
  id: string;
  date: string;
  title: string;
  summary?: string;
  occurredAt?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
};

export const fetchCharacterProfile = (id: string) =>
  fetchJson<{ profile: CharacterProfile }>(`/api/characters/${id}`);

export const fetchCharacterRelationships = (id: string) =>
  fetchJson<{ relationships: RelationshipEdge[] }>(`/api/characters/${id}/relationships`);

export const fetchCharacterMemories = (id: string) =>
  fetchJson<{ memories: CharacterMemory[] }>(`/api/characters/${id}/memories`);

export const fetchCharacterCloseness = (id: string) =>
  fetchJson<{ closeness: { timestamp: string; score: number }[] }>(`/api/characters/${id}/closeness`);

export const fetchCharacterInfluence = (id: string) =>
  fetchJson<{ influence: { category: string; score: number }[] }>(`/api/characters/${id}/influence`);

export const queryCharacterBook = (request: CharacterBookQueryRequest) =>
  fetchJson<{ success: boolean; result: CharacterBookQueryResponse }>('/api/characters/query', {
    method: 'POST',
    body: JSON.stringify(request),
  });
