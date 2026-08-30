import {
  ORGANIZATION_STANCE_HINTS,
  ORGANIZATION_STANCE_LABELS,
  resolveOrganizationStance,
} from '../../lib/organizationStance';
import { GROUP_TYPE_LABELS } from '../../lib/groupTypes';
import type { Organization, UserRelationship } from './OrganizationProfileCard';

const FIELD_LABEL = 'text-[10px] font-semibold uppercase tracking-wide text-white/40';
const FIELD_SELECT =
  'h-10 w-full rounded-lg border border-white/10 bg-black/55 px-3 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20';

const GROUP_TYPE_OPTIONS: Array<{ value: Organization['group_type'] | ''; label: string }> = [
  { value: '', label: '— Not set —' },
  { value: 'family', label: GROUP_TYPE_LABELS.family },
  { value: 'household', label: GROUP_TYPE_LABELS.household },
  { value: 'crew', label: GROUP_TYPE_LABELS.crew },
  { value: 'friend_group', label: GROUP_TYPE_LABELS.friend_group },
  { value: 'band', label: GROUP_TYPE_LABELS.band },
  { value: 'scene', label: GROUP_TYPE_LABELS.scene },
  { value: 'community', label: GROUP_TYPE_LABELS.community },
  { value: 'company', label: GROUP_TYPE_LABELS.company },
  { value: 'team', label: GROUP_TYPE_LABELS.team },
  { value: 'sports_team', label: GROUP_TYPE_LABELS.sports_team },
  { value: 'martial_arts', label: GROUP_TYPE_LABELS.martial_arts },
  { value: 'club', label: GROUP_TYPE_LABELS.club },
  { value: 'collective', label: GROUP_TYPE_LABELS.collective },
  { value: 'nonprofit', label: GROUP_TYPE_LABELS.nonprofit },
  { value: 'institution', label: GROUP_TYPE_LABELS.institution },
  { value: 'brand', label: GROUP_TYPE_LABELS.brand },
  { value: 'vendor', label: GROUP_TYPE_LABELS.vendor },
  { value: 'software', label: GROUP_TYPE_LABELS.software },
  { value: 'public_entity', label: GROUP_TYPE_LABELS.public_entity },
  { value: 'project', label: GROUP_TYPE_LABELS.project },
  { value: 'event_group', label: GROUP_TYPE_LABELS.event_group },
  { value: 'other', label: GROUP_TYPE_LABELS.other },
];

/** Persistable DB values, grouped by the book stance they land in. */
const RELATIONSHIP_GROUPS: Array<{ stance: string; options: Array<{ value: UserRelationship; label: string }> }> = [
  {
    stance: 'Mine',
    options: [
      { value: 'member', label: 'Member' },
      { value: 'founder', label: 'Founder' },
      { value: 'leader', label: 'Leader' },
      { value: 'alumnus', label: 'Alumnus' },
      { value: 'former_member', label: 'Former member' },
    ],
  },
  {
    stance: 'Close to',
    options: [
      { value: 'adjacent', label: 'Adjacent' },
      { value: 'collaborator', label: 'Collaborator' },
    ],
  },
  {
    stance: 'Their world',
    options: [{ value: 'aware_of', label: 'Aware of — their group, not yours' }],
  },
  {
    stance: 'Mentioned',
    options: [
      { value: 'referenced', label: 'Referenced — background lore' },
      { value: 'fan', label: 'Fan' },
    ],
  },
];

const isGroupTypeUnset = (org: Pick<Organization, 'group_type' | 'metadata'>): boolean => {
  if (org.metadata?.group_type_source === 'user_cleared') return true;
  if (org.metadata?.group_type_source) return false;
  return !org.group_type || org.group_type === 'other';
};

type Props = {
  organization: Organization;
  disabled?: boolean;
  onChange: (patch: {
    group_type?: Organization['group_type'];
    type?: Organization['type'];
    user_relationship?: UserRelationship;
    metadata?: Organization['metadata'];
  }) => void;
};

export function OrganizationClassificationEditor({ organization, disabled, onChange }: Props) {
  const stance = resolveOrganizationStance(organization);
  const chatHint = organization.name.trim()
    ? `You can also say in chat: “${organization.name} is a household” or “I belong to ${organization.name}.”`
    : 'You can also correct type and relationship in chat.';

  const handleType = (rawValue: string) => {
    if (rawValue === '') {
      onChange({
        group_type: 'other',
        type: 'other',
        metadata: { ...(organization.metadata ?? {}), group_type_source: 'user_cleared' },
      });
      return;
    }
    const groupType = rawValue as Organization['group_type'];
    const legacyTypes = new Set([
      'friend_group',
      'company',
      'sports_team',
      'club',
      'nonprofit',
      'family',
      'martial_arts',
      'other',
    ]);
    onChange({
      group_type: groupType,
      type: (legacyTypes.has(groupType) ? groupType : 'other') as Organization['type'],
      metadata: { ...(organization.metadata ?? {}), group_type_source: 'user_confirmed' },
    });
  };

  const handleRelationship = (value: string) => {
    onChange({
      user_relationship: value as UserRelationship,
      metadata: { ...(organization.metadata ?? {}), user_relationship_source: 'user_confirmed' },
    });
  };

  return (
    <div className="border-b border-white/8 px-3 py-3 sm:px-4 space-y-3" data-testid="org-classification-editor">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-white/80">Classification</p>
          <p className="text-[11px] text-white/45 mt-0.5">
            Controls the Group type tabs and Your relationship (Mine / Close to / Their world / Mentioned).
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-100"
          title={ORGANIZATION_STANCE_HINTS[stance]}
        >
          {ORGANIZATION_STANCE_LABELS[stance]}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className={FIELD_LABEL}>Group type</span>
          <select
            value={isGroupTypeUnset(organization) ? '' : (organization.group_type ?? 'other')}
            onChange={(event) => handleType(event.target.value)}
            disabled={disabled}
            aria-label="Group type"
            className={FIELD_SELECT}
          >
            {GROUP_TYPE_OPTIONS.map((option) => (
              <option key={option.value || 'unset'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className={FIELD_LABEL}>Your relationship</span>
          <select
            value={organization.user_relationship ?? 'referenced'}
            onChange={(event) => handleRelationship(event.target.value)}
            disabled={disabled}
            aria-label="Your relationship"
            className={FIELD_SELECT}
          >
            {RELATIONSHIP_GROUPS.map((group) => (
              <optgroup key={group.stance} label={group.stance}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-white/40">{chatHint}</p>
    </div>
  );
}
