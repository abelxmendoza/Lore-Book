import { useCallback, useEffect, useState } from 'react';
import type { CertifiedEntity } from '../types/certifiedEntity';
import { matchCertifiedEntities, type CertifiedEntityMatch } from '../lib/certifiedEntityMatch';
import { fetchJson } from '../lib/api';
import { apiCache } from '../lib/cache';
import { dispatchStoryDataUpdated } from '../lib/storyRefresh';

export type EntityType = CertifiedEntity['type'];
export type EntityMatch = CertifiedEntityMatch;

const INDEX_CACHE_KEY = '/api/entities/certified-index';

export const useEntityIndexer = () => {
  const [index, setIndex] = useState<CertifiedEntity[]>([]);
  const [matches, setMatches] = useState<CertifiedEntityMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIndex = useCallback(async () => {
    try {
      const data = await fetchJson<{ entities: CertifiedEntity[] }>(INDEX_CACHE_KEY);
      setIndex(data.entities ?? []);
    } catch {
      setIndex([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  // Refresh when story data changes (new character, org, etc.)
  useEffect(() => {
    const handler = () => {
      apiCache.delete(INDEX_CACHE_KEY);
      void loadIndex();
    };
    window.addEventListener('lk:story-data-updated', handler);
    return () => window.removeEventListener('lk:story-data-updated', handler);
  }, [loadIndex]);

  const analyze = useCallback(
    (text: string) => {
      if (!text.trim()) {
        setMatches([]);
        return;
      }
      setMatches(matchCertifiedEntities(text, index));
    },
    [index]
  );

  const characterMatches = matches.filter((m) => m.type === 'character');
  const locationMatches = matches.filter((m) => m.type === 'location');
  const orgMatches = matches.filter((m) => m.type === 'organization');
  const skillMatches = matches.filter((m) => m.type === 'skill');
  const eventMatches = matches.filter((m) => m.type === 'event');

  return {
    index,
    loading,
    matches,
    characterMatches,
    locationMatches,
    orgMatches,
    skillMatches,
    eventMatches,
    analyze,
    linkedCharacters: characterMatches.map((m) => m.name),
    toggleLink: () => {},
  };
};
