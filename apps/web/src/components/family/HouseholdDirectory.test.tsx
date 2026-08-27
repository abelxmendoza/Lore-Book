import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HouseholdDirectory, type HouseholdDTO, type HouseholdHistoryEntry } from './HouseholdDirectory';

const household: HouseholdDTO = {
  id: 'org-1',
  name: "Mom and Dad's House",
  locationName: '123 Maple St',
  headOfHousehold: 'Mom',
  residents: [{ characterId: 'char-1', name: 'Ralph', householdRole: 'resident', confidence: 0.9 }],
  visitors: [],
  residentCount: 1,
  confidence: 0.9,
};

describe('HouseholdDirectory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty state when there are no households', () => {
    render(<HouseholdDirectory households={[]} />);
    expect(screen.getByText(/LoreBook infers households/i)).toBeInTheDocument();
  });

  it('renders a household card with its residents', () => {
    render(<HouseholdDirectory households={[household]} />);
    expect(screen.getByText('123 Maple St')).toBeInTheDocument();
    expect(screen.getByText('Ralph')).toBeInTheDocument();
  });

  it('prompts for a name and reason, then calls onAddMember', () => {
    const onAddMember = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Grandma').mockReturnValueOnce('moved in for the summer');

    render(<HouseholdDirectory households={[household]} onAddMember={onAddMember} />);
    fireEvent.click(screen.getByText('Add member'));

    expect(onAddMember).toHaveBeenCalledWith('org-1', 'Grandma', 'moved in for the summer');
  });

  it('does not add a member when the name prompt is cancelled', () => {
    const onAddMember = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null);

    render(<HouseholdDirectory households={[household]} onAddMember={onAddMember} />);
    fireEvent.click(screen.getByText('Add member'));

    expect(onAddMember).not.toHaveBeenCalled();
  });

  it('confirms and prompts for a reason before removing a member', () => {
    const onRemoveMember = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    vi.spyOn(window, 'prompt').mockReturnValueOnce('got their own place');

    render(<HouseholdDirectory households={[household]} onRemoveMember={onRemoveMember} />);
    fireEvent.click(screen.getByLabelText('Remove Ralph from this household'));

    expect(onRemoveMember).toHaveBeenCalledWith('org-1', 'char-1', 'Ralph', 'got their own place');
  });

  it('does not remove a member when the confirmation is declined', () => {
    const onRemoveMember = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);

    render(<HouseholdDirectory households={[household]} onRemoveMember={onRemoveMember} />);
    fireEvent.click(screen.getByLabelText('Remove Ralph from this household'));

    expect(onRemoveMember).not.toHaveBeenCalled();
  });

  it('requires a non-empty reason before deleting a household', () => {
    const onDeleteHousehold = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('') // empty reason first
      .mockReturnValueOnce('we all moved out'); // then a real one

    render(<HouseholdDirectory households={[household]} onDeleteHousehold={onDeleteHousehold} />);
    fireEvent.click(screen.getByLabelText('Delete this household'));

    expect(onDeleteHousehold).toHaveBeenCalledWith('org-1', "Mom and Dad's House", 'we all moved out');
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
