import { buildListClipboardText } from './listClipboard';
import type { Character } from '../components/characters/CharacterProfileCard';

export function buildCharacterBookClipboardText(characters: Character[]): string {
  return buildListClipboardText({
    title: 'Character Book',
    items: characters.map((c) => {
      const analytics = c.analytics as
        | { closeness_score?: number; recency_score?: number; mention_count?: number }
        | undefined;
      return {
        heading: c.name,
        fields: [
          { label: 'Id', value: c.id },
          { label: 'Aliases', value: c.alias },
          { label: 'Role', value: c.role },
          { label: 'Archetype', value: c.archetype },
          { label: 'Status', value: c.status },
          { label: 'Importance', value: c.importance_level },
          { label: 'Proximity', value: c.proximity_level },
          { label: 'Relationship depth', value: c.relationship_depth },
          { label: 'Has met', value: c.has_met },
          { label: 'Tags', value: c.tags },
          {
            label: 'Closeness',
            value: analytics?.closeness_score != null ? Math.round(analytics.closeness_score) : null,
          },
          {
            label: 'Recency',
            value: analytics?.recency_score != null ? analytics.recency_score.toFixed(2) : null,
          },
          { label: 'Mentions', value: analytics?.mention_count },
          { label: 'Memories', value: c.memory_count },
          { label: 'Knowledge', value: c.knowledge_count },
          { label: 'Relationships', value: c.relationship_count },
          { label: 'First appearance', value: c.first_appearance },
          { label: 'Updated', value: c.updated_at },
        ],
        body: c.summary?.trim() || undefined,
      };
    }),
  });
}
