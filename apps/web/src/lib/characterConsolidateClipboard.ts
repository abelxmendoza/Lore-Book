import type { CharacterDuplicateGroup } from '../components/characters/CharacterMergePanel';

import { buildListClipboardText } from './listClipboard';

export function buildCharacterConsolidateClipboardText(
  groups: CharacterDuplicateGroup[],
): string {
  return buildListClipboardText({
    title: 'Consolidate Characters — Duplicate Groups',
    items: groups.map((group) => {
      const cardNames = group.characters.map((c) => c.name).filter(Boolean);
      const aliases = group.characters.flatMap((c) => c.alias ?? []);
      return {
        heading: group.canonical_name || cardNames[0] || 'Unnamed group',
        fields: [
          { label: 'Match type', value: group.match_type },
          {
            label: 'Confidence',
            value:
              group.confidence != null ? `${Math.round(group.confidence * 100)}%` : null,
          },
          { label: 'Recommendation', value: group.recommendation },
          { label: 'Reason', value: group.reason },
          { label: 'Cards', value: cardNames },
          { label: 'Card count', value: group.characters.length },
          { label: 'Card ids', value: group.characters.map((c) => c.id) },
          { label: 'Aliases', value: aliases },
          {
            label: 'Statuses',
            value: group.characters.map((c) => c.status).filter(Boolean),
          },
        ],
      };
    }),
  });
}
