import { useCallback, useEffect, useState } from 'react';
import type { CharacterProfile } from '../api/characters';
import { fetchJson } from '../lib/api';
import { findCharacterMentions } from '../utils/characterLinking';

export type EntityType = 'character' | 'location' | 'organization' | 'skill';

export type EntityMatch = {
  id?: string;
  name: string;
  type: EntityType;
  confidence: number;
};

type SlimEntity = { id: string; name: string };

function findEntityMentions(text: string, entities: SlimEntity[], type: EntityType): EntityMatch[] {
  if (!text.trim() || entities.length === 0) return [];
  const textLower = text.toLowerCase();
  return entities
    .filter(e => e.name.length > 2 && textLower.includes(e.name.toLowerCase()))
    .map(e => ({ id: e.id, name: e.name, type, confidence: 0.9 }));
}

export const useEntityIndexer = () => {
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [locations, setLocations] = useState<SlimEntity[]>([]);
  const [organizations, setOrganizations] = useState<SlimEntity[]>([]);
  const [skills, setSkills] = useState<SlimEntity[]>([]);

  const [characterMatches, setCharacterMatches] = useState<EntityMatch[]>([]);
  const [locationMatches, setLocationMatches] = useState<EntityMatch[]>([]);
  const [orgMatches, setOrgMatches] = useState<EntityMatch[]>([]);
  const [skillMatches, setSkillMatches] = useState<EntityMatch[]>([]);

  useEffect(() => {
    void Promise.allSettled([
      fetchJson<{ characters: CharacterProfile[] }>('/api/characters/list')
        .then(r => setCharacters(r.characters ?? []))
        .catch(() => {}),
      fetchJson<{ locations: any[] }>('/api/locations')
        .then(r => setLocations((r.locations ?? []).map((l: any) => ({ id: l.id, name: l.name }))))
        .catch(() => {}),
      fetchJson<{ organizations: any[] }>('/api/organizations')
        .then(r => setOrganizations((r.organizations ?? []).map((o: any) => ({ id: o.id, name: o.name }))))
        .catch(() => {}),
      fetchJson<{ skills: any[] }>('/api/skills')
        .then(r => setSkills((r.skills ?? []).map((s: any) => ({ id: s.id, name: s.skill_name }))))
        .catch(() => {}),
    ]);
  }, []);

  const analyze = useCallback(
    (text: string) => {
      if (!text.trim()) {
        setCharacterMatches([]);
        setLocationMatches([]);
        setOrgMatches([]);
        setSkillMatches([]);
        return;
      }

      const charMentions = findCharacterMentions(text, characters);
      setCharacterMatches(charMentions.map(m => ({ ...m, type: 'character' as const })));
      setLocationMatches(findEntityMentions(text, locations, 'location'));
      setOrgMatches(findEntityMentions(text, organizations, 'organization'));
      setSkillMatches(findEntityMentions(text, skills, 'skill'));
    },
    [characters, locations, organizations, skills]
  );

  const matches: EntityMatch[] = [...characterMatches, ...locationMatches, ...orgMatches, ...skillMatches];

  return {
    matches,
    characterMatches,
    locationMatches,
    orgMatches,
    skillMatches,
    analyze,
    linkedCharacters: characterMatches.filter(m => m.id).map(m => m.name),
    toggleLink: () => {},
  };
};
