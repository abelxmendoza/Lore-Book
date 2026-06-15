/**
 * Client-side entity mention matching for composer chips.
 * Mirrors server entityMentionIndexService matching.
 */

import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';

export type { CertifiedEntity, CertifiedEntityType };

export type EntityMatchKind = 'full' | 'prefix';

export type CertifiedEntityMatch = CertifiedEntity & {
  matchedLabel: string;
  matchKind?: EntityMatchKind;
};

function normalizeNameKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsMention(text: string, label: string): boolean {
  if (label.length < 2) return false;
  const re = new RegExp(`(?<![a-z0-9])${escapeRe(label)}(?![a-z0-9])`, 'i');
  return re.test(text);
}

function lastToken(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/).pop() ?? '';
}

/** Match entities in composer text — full name mentions + prefix autocomplete on last token. */
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
        matched.set(`${entity.type}:${entity.id}`, {
          ...entity,
          matchedLabel: label,
          matchKind: 'full',
        });
        break;
      }
    }
  }

  const prefix = normalizeNameKey(lastToken(text));
  if (prefix.length >= 2) {
    for (const entity of index) {
      const slot = `${entity.type}:${entity.id}`;
      if (matched.has(slot)) continue;

      const keys = entity.mentionKeys?.length
        ? entity.mentionKeys
        : [entity.name, ...entity.aliases].map(normalizeNameKey).filter(Boolean);

      const nameStarts = keys.some((k) => k.startsWith(prefix));
      const labelStarts = [entity.name, ...entity.aliases].some((l) =>
        normalizeNameKey(l).startsWith(prefix)
      );

      if (nameStarts || labelStarts) {
        matched.set(slot, {
          ...entity,
          matchedLabel: entity.name,
          matchKind: 'prefix',
        });
      }
    }
  }

  return [...matched.values()];
}

/** Map entity to chat pipeline thread entity shape (includes skills). */
export function toComposerThreadEntity(
  entity: CertifiedEntity
): { id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' } | null {
  if (entity.type === 'event') return null;
  return { id: entity.id, name: entity.name, type: entity.type };
}

export function mergeThreadEntities(
  base: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' }>,
  composer: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' }>
): Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' }> {
  const map = new Map<string, { id: string; name: string; type: 'character' | 'location' | 'organization' | 'skill' }>();
  for (const e of base) map.set(`${e.type}:${e.id}`, e);
  for (const e of composer) map.set(`${e.type}:${e.id}`, e);
  return [...map.values()];
}
