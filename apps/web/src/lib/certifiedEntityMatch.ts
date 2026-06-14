/**
 * Client-side certified entity mention matching.
 * Mirrors server logic in certifiedEntityIndexService.
 */

import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';

export type { CertifiedEntity, CertifiedEntityType };

export type CertifiedEntityMatch = CertifiedEntity & {
  matchedLabel: string;
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsMention(text: string, label: string): boolean {
  if (label.length < 2) return false;
  const re = new RegExp(`(?<![a-z0-9])${escapeRe(label)}(?![a-z0-9])`, 'i');
  return re.test(text);
}

/** Match certified entities in composer text. Returns only entities with stable ids. */
export function matchCertifiedEntities(
  text: string,
  index: CertifiedEntity[]
): CertifiedEntityMatch[] {
  if (!text.trim() || index.length === 0) return [];

  const matched = new Map<string, CertifiedEntityMatch>();

  for (const entity of index) {
    const labels = [entity.name, ...entity.aliases]
      .filter((l) => l.length >= 2)
      .sort((a, b) => b.length - a.length);

    for (const label of labels) {
      if (containsMention(text, label)) {
        matched.set(`${entity.type}:${entity.id}`, { ...entity, matchedLabel: label });
        break;
      }
    }
  }

  return [...matched.values()];
}

/** Map certified entity to chat pipeline thread entity shape. */
export function toComposerThreadEntity(
  entity: CertifiedEntity
): { id: string; name: string; type: 'character' | 'location' | 'organization' } | null {
  if (entity.type === 'skill' || entity.type === 'event') return null;
  return { id: entity.id, name: entity.name, type: entity.type };
}

export function mergeThreadEntities(
  base: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' }>,
  composer: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' }>
): Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' }> {
  const map = new Map<string, { id: string; name: string; type: 'character' | 'location' | 'organization' }>();
  for (const e of base) map.set(e.id, e);
  for (const e of composer) map.set(e.id, e);
  return [...map.values()];
}
