import { useEffect, useRef, useState } from 'react';

import {
  ORGANIZATION_MEMBER_ROLES,
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
};

/**
 * Visible role picker (not a datalist) so every role is selectable.
 * Preset roles + optional Custom… free-text field.
 */
export function OrganizationMemberRoleSelect({
  value,
  onChange,
  disabled,
  id,
  'data-testid': dataTestId,
  className = 'rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-primary/60 focus:outline-none',
  allowEmpty = true,
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
        {ORGANIZATION_MEMBER_ROLES.map((role) => (
          <option key={role} value={role}>
            {formatOrganizationMemberRoleLabel(role)}
          </option>
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
    </div>
  );
}
