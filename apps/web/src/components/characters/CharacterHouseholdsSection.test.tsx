import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterHouseholdsSection } from './CharacterHouseholdsSection';
import type { Organization } from '../organizations/OrganizationProfileCard';

const household = (overrides: Partial<Organization> = {}): Organization =>
  ({
    id: 'h-mom',
    name: "Mom's House",
    aliases: [],
    type: 'other',
    group_type: 'household',
    membership_model: 'strict',
    user_relationship: 'aware_of',
    is_public_entity: false,
    status: 'active',
    member_count: 2,
    usage_count: 4,
    confidence: 0.9,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    members: [
      { id: '1', character_name: 'Theo Whitfield', role: 'lives here', status: 'active' },
      { id: '2', character_name: 'Dana Whitfield', role: 'head of household', status: 'active' },
    ],
    ...overrides,
  }) as Organization;

describe('CharacterHouseholdsSection', () => {
  it('lists every household and who else lives there', () => {
    render(
      <CharacterHouseholdsSection
        characterName="Theo Whitfield"
        organizations={[
          household(),
          household({
            id: 'h-step',
            name: 'Morgan Household',
            members: [
              { id: '3', character_name: 'Theo Whitfield', role: 'weekends', status: 'active' },
              { id: '4', character_name: 'You', role: 'lives here', status: 'active' },
            ],
          }),
        ]}
        householdCatalog={[]}
      />,
    );

    expect(screen.getByTestId('character-households-section')).toHaveTextContent("Mom's House");
    expect(screen.getByTestId('character-households-section')).toHaveTextContent('Morgan Household');
    expect(screen.getByText(/More than one home/i)).toBeInTheDocument();
    expect(screen.getByText(/Dana Whitfield/)).toBeInTheDocument();
  });

  it('can add an existing household and create a new one', () => {
    const onAddExisting = vi.fn();
    const onCreate = vi.fn();
    render(
      <CharacterHouseholdsSection
        characterName="Lina Solenne"
        organizations={[]}
        householdCatalog={[household({ id: 'h-aunt', name: "Aunt Maribel's House" })]}
        canEdit
        addOpen
        addTargetId="h-aunt"
        addRole="visits"
        createName="Uncle Javier's Place"
        onAddTargetId={vi.fn()}
        onAddRole={vi.fn()}
        onCreateName={vi.fn()}
        onAddExisting={onAddExisting}
        onCreate={onCreate}
        onToggleAdd={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('add-household-submit'));
    expect(onAddExisting).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/create it/i));
    fireEvent.click(screen.getByTestId('create-household-submit'));
    expect(onCreate).toHaveBeenCalled();
  });
});
