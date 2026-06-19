/**
 * Build a certified entity index from in-memory demo/mock book data — no API.
 */

import { mockDataService } from '../services/mockDataService';
import type { CertifiedEntity } from '../types/certifiedEntity';

function normalizeKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionKeys(name: string, aliases: string[] = []): string[] {
  const keys = new Set<string>([normalizeKey(name), ...aliases.map(normalizeKey)]);
  return [...keys].filter(Boolean);
}

/** Certified index for demo mode composer + simulated chat entity linking. */
export function buildDemoCertifiedIndex(): CertifiedEntity[] {
  const entities: CertifiedEntity[] = [];
  const seen = new Set<string>();

  const add = (entity: CertifiedEntity) => {
    const key = `${entity.type}:${normalizeKey(entity.name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push(entity);
  };

  for (const character of mockDataService.get.characters()) {
    const aliases = character.alias ?? [];
    add({
      id: character.id,
      name: character.name,
      type: 'character',
      aliases,
      mentionKeys: mentionKeys(character.name, aliases),
      status: 'confirmed',
    });
  }

  for (const location of mockDataService.get.locations()) {
    add({
      id: location.id,
      name: location.name,
      type: 'location',
      aliases: [],
      mentionKeys: mentionKeys(location.name),
      status: 'confirmed',
    });
  }

  for (const skill of mockDataService.get.skills()) {
    add({
      id: skill.id,
      name: skill.skill_name,
      type: 'skill',
      aliases: [],
      mentionKeys: mentionKeys(skill.skill_name),
      status: 'confirmed',
    });
  }

  return entities;
}
