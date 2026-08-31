import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrganizationClassificationEditor } from './OrganizationClassificationEditor';
import type { Organization } from './OrganizationProfileCard';

const org = (overrides: Partial<Organization> = {}): Organization =>
  ({
    id: 'org-1',
    name: 'Northwind Household',
    aliases: [],
    type: 'other',
    group_type: 'other',
    membership_model: 'strict',
    user_relationship: 'referenced',
    is_public_entity: false,
    status: 'active',
    member_count: 0,
    usage_count: 1,
    confidence: 0.5,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {},
    members: [],
    ...overrides,
  }) as Organization;

describe('OrganizationClassificationEditor', () => {
  it('saves group type and relationship corrections', () => {
    const onChange = vi.fn();
    render(<OrganizationClassificationEditor organization={org()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Group type'), { target: { value: 'household' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        group_type: 'household',
        metadata: expect.objectContaining({ group_type_source: 'user_confirmed' }),
      }),
    );

    fireEvent.change(screen.getByLabelText('Your relationship'), { target: { value: 'member' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        user_relationship: 'member',
        metadata: expect.objectContaining({ user_relationship_source: 'user_confirmed' }),
      }),
    );
  });

  it('shows the stored type when auto-detect never stamped a source', () => {
    render(
      <OrganizationClassificationEditor
        organization={org({ group_type: 'martial_arts', metadata: {} })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Group type')).toHaveValue('martial_arts');
  });

  it('shows the book tab the group currently lands in', () => {
    render(
      <OrganizationClassificationEditor
        organization={org({ user_relationship: 'member' })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.getByText(/I belong to Northwind Household/i)).toBeInTheDocument();
  });

  it('moves Their world vs Mentioned independently of roster', () => {
    const onChange = vi.fn();
    render(
      <OrganizationClassificationEditor
        organization={org({
          user_relationship: 'referenced',
          members: [{ id: 'm1', character_id: 'c1', character_name: 'Jamie', status: 'active' }],
        })}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Your relationship'), { target: { value: 'aware_of' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        user_relationship: 'aware_of',
        metadata: expect.objectContaining({ user_relationship_source: 'user_confirmed' }),
      }),
    );
  });
});
