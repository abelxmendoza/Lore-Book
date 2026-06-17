import { fetchJson } from '../lib/api';

export type RomanticLexicalHit = {
  partnerName: string;
  relationshipType: string;
  status: string;
  confidence: number;
  evidence: string;
  cues: string[];
  ontologyTags: string[];
  isSituationship: boolean;
};

export type RomanticRescanSummary = {
  scannedEpisodes: number;
  romanticEpisodes: number;
  partnersDiscovered: number;
  relationshipsUpserted: number;
  interactionsLogged: number;
  glossaryCuesMatched: number;
  partnerNames: string[];
  lexicalHits: RomanticLexicalHit[];
};

export const romanticRelationshipsApi = {
  rescan: () =>
    fetchJson<{ success: boolean; summary: RomanticRescanSummary }>(
      '/api/conversation/romantic-relationships/rescan',
      { method: 'POST' }
    ),
};
