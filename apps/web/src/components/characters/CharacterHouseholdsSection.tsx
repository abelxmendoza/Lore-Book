import { useState } from 'react';
import { Home, Loader2, Plus, Trash2, Users } from 'lucide-react';

import {
  characterHouseholdRole,
  formatHouseholdRoleLabel,
  householdArrangementCopy,
  otherHouseholdPeople,
  type CharacterOrganization,
} from '../../lib/characterHouseholds';
import { isHouseholdGroup } from '../../lib/groupTaxonomy';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { OrganizationMemberRoleSelect } from '../ui/OrganizationMemberRoleSelect';
import { ConnectionSectionHeader } from './ConnectionSectionHeader';
import type { Organization } from '../organizations/OrganizationProfileCard';

type Props = {
  characterName: string;
  characterId?: string | null;
  isSelf?: boolean;
  organizations: CharacterOrganization[];
  householdCatalog: Organization[];
  canEdit?: boolean;
  saving?: boolean;
  creating?: boolean;
  optionsLoading?: boolean;
  error?: string | null;
  addOpen?: boolean;
  addTargetId?: string;
  addRole?: string;
  createName?: string;
  roleSavingId?: string | null;
  onToggleAdd?: () => void;
  onAddTargetId?: (id: string) => void;
  onAddRole?: (role: string) => void;
  onCreateName?: (name: string) => void;
  onAddExisting?: () => void;
  onCreate?: () => void;
  onOpenHousehold?: (org: CharacterOrganization) => void;
  onRemove?: (org: CharacterOrganization) => void;
  onRoleChange?: (org: CharacterOrganization, role: string) => void;
};

export function CharacterHouseholdsSection({
  characterName,
  characterId,
  isSelf = false,
  organizations,
  householdCatalog,
  canEdit = false,
  saving = false,
  creating = false,
  optionsLoading = false,
  error,
  addOpen = false,
  addTargetId = '',
  addRole = 'lives here',
  createName = '',
  roleSavingId,
  onToggleAdd,
  onAddTargetId,
  onAddRole,
  onCreateName,
  onAddExisting,
  onCreate,
  onOpenHousehold,
  onRemove,
  onRoleChange,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const who = isSelf ? 'you' : characterName;
  const arrangement = householdArrangementCopy(organizations, characterId, characterName, isSelf);
  const linkedIds = new Set(organizations.map((org) => org.id));
  const available = householdCatalog.filter((org) => isHouseholdGroup(org) && !linkedIds.has(org.id));

  return (
    <div data-testid="character-households-section" className="pt-8 border-t border-white/[0.06]">
      <ConnectionSectionHeader
        icon={Home}
        title="Households"
        meta={`${organizations.length} ${organizations.length === 1 ? 'home' : 'homes'}`}
        action={
          canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-white/55"
              onClick={onToggleAdd}
              data-testid="add-household-toggle"
            >
              <Plus className="h-3 w-3" />
              <span className="ml-1">{addOpen ? 'Close' : 'Add'}</span>
            </Button>
          ) : undefined
        }
      />
      <p className="text-xs text-white/35 mb-3">
        Homes {isSelf ? 'you belong' : `${characterName} belongs`} to. A person can have more than one — mom&apos;s house
        and dad&apos;s, two apartments, a cousin&apos;s other side of the family.
      </p>
      {arrangement && (
        <p className="text-[11px] text-amber-100/80 mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
          {arrangement}
        </p>
      )}
      {addOpen && canEdit && (
        <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
          <p className="text-[10px] text-white/40">
            Link {who} to a household already in Groups, or name a new one.
          </p>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
            <select
              value={addTargetId}
              onChange={(event) => onAddTargetId?.(event.target.value)}
              disabled={optionsLoading}
              aria-label="Existing household"
              className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-amber-500/60 focus:outline-none"
            >
              <option value="">{optionsLoading ? 'Loading…' : 'Choose a household…'}</option>
              {available.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <OrganizationMemberRoleSelect
              variant="household"
              value={addRole}
              onChange={(role) => onAddRole?.(role)}
              disabled={saving}
              allowEmpty={false}
              data-testid="add-household-role"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={!addTargetId || saving}
              onClick={onAddExisting}
              data-testid="add-household-submit"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </Button>
          </div>
          <button
            type="button"
            className="text-[11px] text-amber-200/80 hover:text-amber-100"
            onClick={() => setCreateOpen((open) => !open)}
          >
            {createOpen ? 'Hide new household' : 'This home isn’t in the book yet — create it'}
          </button>
          {createOpen && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_auto]">
              <input
                value={createName}
                onChange={(event) => onCreateName?.(event.target.value)}
                placeholder={`${characterName.split(' ')[0] ?? 'Their'}'s House`}
                aria-label="New household name"
                className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-amber-500/60 focus:outline-none"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={!createName.trim() || creating}
                onClick={onCreate}
                data-testid="create-household-submit"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create household'}
              </Button>
            </div>
          )}
        </div>
      )}
      {error && canEdit && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {organizations.length === 0 && (
        <p className="text-xs text-white/30 italic text-center py-4">
          No households linked yet. Mention where they live in chat, or add a home here.
        </p>
      )}
      <div className="space-y-2">
        {organizations.map((org) => {
          const role = characterHouseholdRole(org, characterId, characterName, isSelf);
          const others = otherHouseholdPeople(org, characterId, characterName, isSelf);
          return (
            <div
              key={org.id}
              className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 flex flex-col gap-2"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => onOpenHousehold?.(org)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white/90 truncate">{org.name}</p>
                    <Badge variant="outline" className="text-[10px] py-0 border-amber-400/30 text-amber-100">
                      {formatHouseholdRoleLabel(role)}
                    </Badge>
                  </div>
                  {org.location && (
                    <p className="text-[11px] text-white/40 mt-0.5 truncate">{org.location}</p>
                  )}
                  {others.length > 0 && (
                    <p className="text-[11px] text-white/45 mt-1 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      With {others.map((member) => member.character_name).slice(0, 4).join(', ')}
                      {others.length > 4 ? ` +${others.length - 4}` : ''}
                    </p>
                  )}
                </button>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0 h-6 w-6 p-0 mt-0.5 text-white/25 hover:text-red-400"
                    aria-label={`Remove ${characterName} from ${org.name}`}
                    onClick={() => onRemove?.(org)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {canEdit && (
                <div className="max-w-xs">
                  <OrganizationMemberRoleSelect
                    variant="household"
                    value={role}
                    disabled={roleSavingId === org.id}
                    allowEmpty={false}
                    data-testid={`household-role-select-${org.id}`}
                    onChange={(next) => {
                      if (next && next !== role) onRoleChange?.(org, next);
                    }}
                    className="h-8 rounded-lg border border-white/10 bg-black/50 px-2 text-[11px] text-white focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
