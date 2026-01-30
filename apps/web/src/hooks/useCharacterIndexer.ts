import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CharacterProfile } from '../api/characters';
import { config } from '../config/env';
import { fetchJson } from '../lib/api';
import { findCharacterMentions, type CharacterMatch } from '../utils/characterLinking';
import { useMockData } from '../contexts/MockDataContext';

type IndexedCharacter = CharacterMatch & { linked: boolean };

const EMPTY_CHARACTERS: CharacterProfile[] = [];

export const useCharacterIndexer = () => {
  const { useMockData: isMockEnabled } = useMockData();
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [matches, setMatches] = useState<IndexedCharacter[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const useMockFallback = isMockEnabled || config.dev.allowMockData;
        const { characters: list } = await fetchJson<{ characters: CharacterProfile[] }>(
          `/api/characters/list`,
          undefined,
          { useMockData: useMockFallback, mockData: { characters: EMPTY_CHARACTERS } }
        );
        setCharacters(list ?? []);
      } catch (error) {
        console.warn('Failed to load characters', error);
      }
    };
    void load();
  }, [isMockEnabled]);

  const analyze = useCallback(
    (text: string) => {
      const detected = findCharacterMentions(text, characters);
      setMatches((prev) => {
        const existing = new Map(prev.map((item) => [item.name.toLowerCase(), item]));
        return detected.map((match) => {
          const key = match.name.toLowerCase();
          const previous = existing.get(key);
          return { ...match, linked: previous?.linked ?? Boolean(match.id) };
        });
      });
    },
    [characters]
  );

  const toggleLink = useCallback((name: string) => {
    setMatches((prev) =>
      prev.map((item) => (item.name === name ? { ...item, linked: !item.linked } : item))
    );
  }, []);

  const linkedCharacters = useMemo(() => matches.filter((match) => match.linked).map((match) => match.name), [matches]);

  return { matches, analyze, toggleLink, linkedCharacters };
};
