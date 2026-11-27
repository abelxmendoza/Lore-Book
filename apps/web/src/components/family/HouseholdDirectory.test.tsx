import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  filterHouseholdsToListedFamily,
  HouseholdDirectory,
  type HouseholdDTO,
  type HouseholdHistoryEntry,
} from './HouseholdDirectory';
import { copyTextToClipboard } from '../../lib/listClipboard';

vi.mock('../../lib/listClipboard', async (orig) => {
  const actual = await orig<typeof import('../../lib/listClipboard')>();
  return {
    ...actual,
    copyTextToClipboard: vi.fn().mockResolvedValue(true),
  };
});

const household: HouseholdDTO = {
  id: 'org-1',
  name: "Jamie's House",
  locationName: '123 Maple St',
  headOfHousehold: 'Jamie',
  residents: [{ characterId: 'char-1', name: 'Ralph', householdRole: 'resident', confidence: 0.9 }],
  visitors: [],
  residentCount: 1,
  confidence: 0.9,
};

const secondHousehold: HouseholdDTO = {
  id: 'org-2',
  name: 'Solenne House',
  locationName: 'Cliffside Family House',
  headOfHousehold: 'Elena',
  residents: [{ characterId: 'char-3', name: 'Elena', householdRole: 'resident', confidence: 0.9 }],
  visitors: [],
  residentCount: 1,
  confidence: 0.85,
};

const familyCandidates = [
  { id: 'char-1', name: 'Ralph', relationLabel: 'son' },
  { id: 'char-2', name: 'Jamie', relationLabel: 'self' },
  { id: 'char-3', name: 'Elena', relationLabel: 'mom' },
];

describe('filterHouseholdsToListedFamily', () => {
  it('drops people who are no longer on the family tree', () => {
    const [filtered] = filterHouseholdsToListedFamily(
      [
        {
          ...household,
          residents: [
            { characterId: 'char-1', name: 'Ralph', householdRole: 'resident', confidence: 0.9 },
            { characterId: 'char-x', name: 'Alex Friend', householdRole: 'resident', confidence: 0.4 },
          ],
          residentCount: 2,
          headOfHousehold: 'Alex Friend',
        },
      ],
      ['char-1', 'char-2'],
    );
    expect(filtered.residents.map((m) => m.name)).toEqual(['Ralph']);
    expect(filtered.residentCount).toBe(1);
    expect(filtered.headOfHousehold).toBeUndefined();
  });
});

describe('HouseholdDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
  });

  it('renders the empty state when there are no households', () => {
    render(<HouseholdDirectory households={[]} />);
    expect(screen.getByText(/only people on your family tree can be residents/i)).toBeInTheDocument();
  });

  it('renders a household card with its residents', () => {
    render(<HouseholdDirectory households={[household]} />);
    expect(screen.getByText('123 Maple St')).toBeInTheDocument();
    expect(screen.getByText('Ralph')).toBeInTheDocument();
  });

  it('copies all households as plain text', async () => {
    render(<HouseholdDirectory households={[household]} />);
    fireEvent.click(screen.getByTestId('households-copy-all'));
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledTimes(1));
    const payload = String(vi.mocked(copyTextToClipboard).mock.calls[0]?.[0] ?? '');
    expect(payload).toContain('Households (1 item)');
    expect(payload).toContain('123 Maple St');
    expect(payload).toContain('Ralph');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('creates a household from the dialog', () => {
    const onCreateHousehold = vi.fn();
    render(<HouseholdDirectory households={[]} onCreateHousehold={onCreateHousehold} />);
    fireEvent.click(screen.getByText('New household'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText("Mom and Dad's house"), {
      target: { value: 'Harbor District Household' },
    });
    fireEvent.click(within(dialog).getByText('Create household'));
    expect(onCreateHousehold).toHaveBeenCalledWith('Harbor District Household', undefined);
  });

  it('edits household name and location', () => {
    const onUpdateHousehold = vi.fn();
    render(
      <HouseholdDirectory households={[household]} onUpdateHousehold={onUpdateHousehold} />,
    );
    fireEvent.click(screen.getByLabelText("Edit Jamie's House"));
    const dialog = screen.getByRole('dialog');
    const inputs = within(dialog).getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: "Jamie and Marcus's House" } });
    fireEvent.change(inputs[1], { target: { value: '456 Oak Ave' } });
    fireEvent.click(within(dialog).getByText('Save'));
    expect(onUpdateHousehold).toHaveBeenCalledWith('org-1', {
      name: "Jamie and Marcus's House",
      locationName: '456 Oak Ave',
      reason: undefined,
    });
  });

  it('adds a listed family member from the picker, not a free-typed name', () => {
    const onAddMember = vi.fn();
    render(
      <HouseholdDirectory
        households={[household]}
        familyCandidates={familyCandidates}
        onAddMember={onAddMember}
      />,
    );
    fireEvent.click(screen.getByText('Add member'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Ralph')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByText(/Jamie/));
    fireEvent.click(within(dialog).getByText('Add to household'));
    expect(onAddMember).toHaveBeenCalledWith('org-1', 'Jamie', undefined, 'char-2');
  });

  it('does not add a member until someone on the family list is selected', () => {
    const onAddMember = vi.fn();
    render(
      <HouseholdDirectory
        households={[household]}
        familyCandidates={familyCandidates}
        onAddMember={onAddMember}
      />,
    );
    fireEvent.click(screen.getByText('Add member'));
    fireEvent.click(screen.getByText('Add to household'));
    expect(onAddMember).not.toHaveBeenCalled();
  });

  it('removes a member after confirming in the dialog', () => {
    const onRemoveMember = vi.fn();
    render(<HouseholdDirectory households={[household]} onRemoveMember={onRemoveMember} />);
    fireEvent.click(screen.getByLabelText('Remove Ralph from this household'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'got their own place' } });
    fireEvent.click(screen.getByText('Remove from household'));
    expect(onRemoveMember).toHaveBeenCalledWith('org-1', 'char-1', 'Ralph', 'got their own place');
  });

  it('requires a non-empty reason before deleting a household', () => {
    const onDeleteHousehold = vi.fn();
    render(
      <HouseholdDirectory households={[household]} onDeleteHousehold={onDeleteHousehold} />,
    );
    fireEvent.click(screen.getByLabelText('Delete this household'));
    fireEvent.click(screen.getByText('Delete household'));
    expect(onDeleteHousehold).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Required'), { target: { value: 'we all moved out' } });
    fireEvent.click(screen.getByText('Delete household'));
    expect(onDeleteHousehold).toHaveBeenCalledWith('org-1', "Jamie's House", 'we all moved out');
  });

  it('merges the selected household into another', () => {
    const onMergeHouseholds = vi.fn();
    render(
      <HouseholdDirectory
        households={[household, secondHousehold]}
        onMergeHouseholds={onMergeHouseholds}
      />,
    );
    fireEvent.click(screen.getByLabelText("Merge Jamie's House into another household"));
    fireEvent.click(screen.getByText('Merge households'));
    expect(onMergeHouseholds).toHaveBeenCalledWith('org-2', 'org-1', undefined);
  });

  it('expands history on click and renders fetched entries', async () => {
    const entries: HouseholdHistoryEntry[] = [
      {
        kind: 'stay',
        characterId: 'char-1',
        characterName: 'Ralph',
        joinedAt: '2020-01-01T00:00:00Z',
        leftAt: null,
        joinReason: 'moved in after college',
        leaveReason: null,
      },
    ];
    const onFetchHistory = vi.fn().mockResolvedValue(entries);

    render(<HouseholdDirectory households={[household]} onFetchHistory={onFetchHistory} />);
    fireEvent.click(screen.getByText('History'));

    await waitFor(() => expect(screen.getByText(/moved in after college/i)).toBeInTheDocument());
    expect(onFetchHistory).toHaveBeenCalledWith('org-1');
  });
});
