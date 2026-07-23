import type { RomanticRelationship } from '../components/love/LoveAndRelationshipsView';

import { buildListClipboardText } from './listClipboard';

function percent(value: number | null | undefined): string | null {
  return value == null ? null : `${Math.round(value * 100)}%`;
}

export function buildDatingRomanceClipboardText(
  relationships: RomanticRelationship[],
): string {
  return buildListClipboardText({
    title: 'Dating and Romance',
    items: relationships.map((relationship) => {
      const signals = relationship.metadata?.signals;
      return {
        heading:
          relationship.person_name?.trim() ||
          relationship.relationship_type.replace(/_/g, ' '),
        fields: [
          { label: 'Id', value: relationship.id },
          { label: 'Person ID', value: relationship.person_id },
          { label: 'Character ID', value: relationship.character_id },
          { label: 'Person type', value: relationship.person_type },
          { label: 'Relationship type', value: relationship.relationship_type },
          { label: 'Status', value: relationship.status },
          { label: 'Current', value: relationship.is_current },
          { label: 'Situationship', value: relationship.is_situationship },
          { label: 'Exclusivity', value: relationship.exclusivity_status },
          { label: 'Affection', value: percent(relationship.affection_score) },
          { label: 'Emotional intensity', value: percent(relationship.emotional_intensity) },
          { label: 'Compatibility', value: percent(relationship.compatibility_score) },
          { label: 'Relationship health', value: percent(relationship.relationship_health) },
          { label: 'Strengths', value: relationship.strengths },
          { label: 'Weaknesses', value: relationship.weaknesses },
          { label: 'Pros', value: relationship.pros },
          { label: 'Cons', value: relationship.cons },
          { label: 'Red flags', value: relationship.red_flags },
          { label: 'Green flags', value: relationship.green_flags },
          { label: 'Started', value: relationship.start_date },
          { label: 'Ended', value: relationship.end_date },
          { label: 'Rank overall', value: relationship.rank_among_all },
          { label: 'Rank active', value: relationship.rank_among_active },
          { label: 'Attachment intensity', value: percent(signals?.attachment_intensity) },
          { label: 'Fixation signal', value: percent(signals?.obsession_score) },
          { label: 'Evidence strength', value: percent(signals?.evidence_strength) },
          { label: 'Signal strength', value: signals?.signal_strength },
          { label: 'Partner sex', value: relationship.character_sex },
          { label: 'Romantic filter note', value: relationship.user_romantic_filter?.note },
          { label: 'Created', value: relationship.created_at },
        ],
      };
    }),
  });
}
