import { buildListClipboardText } from './listClipboard';
import type { Organization } from '../components/organizations/OrganizationProfileCard';

export function buildOrganizationBookClipboardText(organizations: Organization[]): string {
  return buildListClipboardText({
    title: 'Groups and Organizations',
    items: organizations.map((org) => {
      const members = (org.members ?? [])
        .map((m) => (m.role ? `${m.character_name} (${m.role})` : m.character_name))
        .filter(Boolean)
        .slice(0, 16);
      const locations = (org.locations ?? [])
        .map((l) => l.location_name)
        .filter(Boolean)
        .slice(0, 10);

      return {
        heading: org.name,
        fields: [
          { label: 'Id', value: org.id },
          { label: 'Aliases', value: org.aliases },
          { label: 'Type', value: org.type },
          { label: 'Group type', value: org.group_type },
          { label: 'User relationship', value: org.user_relationship },
          { label: 'Membership model', value: org.membership_model },
          { label: 'Public entity', value: org.is_public_entity },
          { label: 'Location', value: org.location },
          { label: 'Founded', value: org.founded_year ?? org.founded_date },
          { label: 'Dissolved', value: org.dissolved_year },
          { label: 'Members', value: members },
          { label: 'Member count', value: org.member_count ?? org.members?.length },
          { label: 'Places', value: locations },
          { label: 'Stories', value: org.stories?.length },
          { label: 'Events', value: org.events?.length },
          {
            label: 'Importance',
            value:
              org.analytics?.importance_score != null
                ? Math.round(org.analytics.importance_score)
                : null,
          },
          {
            label: 'Involvement',
            value:
              org.analytics?.user_involvement_score != null
                ? Math.round(org.analytics.user_involvement_score)
                : null,
          },
          { label: 'Usage', value: org.usage_count },
          { label: 'Confidence', value: org.confidence },
          { label: 'Status', value: org.status },
          { label: 'Last seen', value: org.last_seen ?? org.updated_at },
          { label: 'Family generations', value: org.generations },
          { label: 'Family branches', value: org.family_branches },
          { label: 'Trend', value: org.analytics?.trend },
        ],
        body: org.description?.trim() || undefined,
      };
    }),
  });
}
