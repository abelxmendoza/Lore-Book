import { useEffect, useRef, useState } from 'react';

import {
  ORGANIZATION_MEMBER_ROLE_GROUPS,
  CUSTOM_ORG_MEMBER_ROLE,
  isPresetOrganizationMemberRole,
  resolveOrganizationMemberRolePreset,
  formatOrganizationMemberRoleLabel,
} from '../../lib/organizationMemberRoles';

type Props = {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  id?: string;
  'data-testid'?: string;
  className?: string;
  /** When true, first option is "Choose role…" with empty value. */
  allowEmpty?: boolean;
  /** Household pickers only show home roles (lives here, weekends, visitor, …). */
  variant?: 'default' | 'household';
};

/**
 * Visible role picker (not a datalist) so every role is selectable.
 * Preset seats/titles in the group + optional Custom… free-text field.
 * Relationship labels (coworker, friend) belong on the character profile.
 */
export function OrganizationMemberRoleSelect({
  value,
  onChange,
  disabled,
  id,
  'data-testid': dataTestId,
  className = 'rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-primary/60 focus:outline-none',
  allowEmpty = true,
  variant = 'default',
}: Props) {
  const [customMode, setCustomMode] = useState(
    () => Boolean(value) && !isPresetOrganizationMemberRole(value),
  );
  const customSelectionPending = useRef(false);

  useEffect(() => {
    if (value && !isPresetOrganizationMemberRole(value)) {
      customSelectionPending.current = false;
      setCustomMode(true);
    } else if (isPresetOrganizationMemberRole(value)) {
      customSelectionPending.current = false;
      setCustomMode(false);
    } else if (!value) {
      // Selecting Custom… from an existing preset intentionally clears the
      // controlled value before the user types. Preserve the input for that render.
      if (customSelectionPending.current) {
        customSelectionPending.current = false;
        return;
      }
      setCustomMode(false);
    }
  }, [value]);

  const preset = resolveOrganizationMemberRolePreset(value);
  const selectValue = customMode ? CUSTOM_ORG_MEMBER_ROLE : (preset ?? value);
  const roleGroups = variant === 'household'
    ? ORGANIZATION_MEMBER_ROLE_GROUPS.filter((group) => group.label === 'Household')
    : ORGANIZATION_MEMBER_ROLE_GROUPS;
  const hint = variant === 'household'
    ? 'How they belong in this home — a person can also belong to another household.'
    : 'Their role in this group — not how you know them.';

  return (
    <div className="space-y-1.5 min-w-0">
      <select
        id={id}
        value={selectValue}
        disabled={disabled}
        aria-label="Membership role"
        data-testid={dataTestId}
        onChange={(e) => {
          const next = e.target.value;
          if (next === CUSTOM_ORG_MEMBER_ROLE) {
            customSelectionPending.current = true;
            setCustomMode(true);
            if (isPresetOrganizationMemberRole(value) || !value) {
              onChange('');
            }
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
        className={`w-full ${className}`}
      >
        {allowEmpty && <option value="">Choose role…</option>}
        {roleGroups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.roles.map((role) => (
              <option key={role} value={role}>
                {formatOrganizationMemberRoleLabel(role)}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM_ORG_MEMBER_ROLE}>Custom…</option>
      </select>
      {customMode && (
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a custom role"
          aria-label="Custom membership role"
          data-testid={dataTestId ? `${dataTestId}-custom` : undefined}
          className={className}
        />
      )}
      <p className="text-[10px] text-white/40 leading-snug" data-testid={dataTestId ? `${dataTestId}-hint` : undefined}>
        {hint}
      </p>
    </div>
  );
}
