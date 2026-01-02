import { fetchJson } from '../lib/api';

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
