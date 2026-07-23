import type { LocationDuplicateGroup } from '../components/locations/LocationMergePanel';

import { buildListClipboardText } from './listClipboard';

export function buildLocationDuplicatesClipboardText(groups: LocationDuplicateGroup[]): string {
  return buildListClipboardText({
    title: 'Duplicate Places',
    items: groups.map((group) => {
      const cardNames = group.locations.map((loc) => loc.name).filter(Boolean);
      const aliases = group.locations.flatMap((loc) =>
        Array.isArray(loc.metadata?.aliases) ? (loc.metadata!.aliases as string[]) : [],
      );
      return {
        heading: group.canonical_name || cardNames[0] || 'Unnamed group',
        fields: [
          { label: 'Match type', value: group.match_type },
          { label: 'Label', value: group.label },
          { label: 'Subtype', value: group.place_subtype },
          { label: 'Owner', value: group.owner_display_name },
          { label: 'Privacy sensitive', value: group.privacy_sensitive },
          {
            label: 'Confidence',
            value: group.confidence != null ? `${Math.round(group.confidence * 100)}%` : null,
          },
          { label: 'Reason', value: group.reason },
          { label: 'Variant reason', value: group.variant_reason },
          { label: 'Cards', value: cardNames },
          { label: 'Card count', value: group.locations.length },
          { label: 'Existing aliases', value: aliases },
          { label: 'Evidence', value: group.evidence },
        ],
      };
    }),
  });
}
