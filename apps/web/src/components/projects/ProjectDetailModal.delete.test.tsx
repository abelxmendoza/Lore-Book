import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectDetailModal } from './ProjectDetailModal';
import type { ProjectCardData } from './ProjectProfileCard';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => true,
}));

const project: ProjectCardData = {
  id: 'proj-1',
  name: 'MemoVault',
  type: 'software',
  status: 'active',
  description: 'A vault for notes',
  tags: ['code'],
  started_at: '2024-01-15T00:00:00.000Z',
  updated_at: '2024-06-01T00:00:00.000Z',
  metadata: { aliases: ['MV'] },
};

function renderModal(onDelete = vi.fn(), onPatch = vi.fn(async () => {})) {
  return render(
    <MemoryRouter>
      <ProjectDetailModal
        project={project}
        onClose={vi.fn()}
        onPatch={onPatch}
        onDelete={onDelete}
      />
    </MemoryRouter>
  );
}

describe('ProjectDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts Delete in the nav and requires two steps before deleting', async () => {
    const onDelete = vi.fn();
    renderModal(onDelete);

    expect(screen.queryByTitle('Delete project')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /delete project/i }));

    expect(await screen.findByText(/Delete MemoVault\?/i)).toBeTruthy();
    expect(screen.getByText(/Step 1 of 2/i)).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('project-delete-continue'));
    expect(await screen.findByText(/Type the name to confirm/i)).toBeTruthy();
    expect(screen.getByText(/Step 2 of 2/i)).toBeTruthy();

    const confirm = screen.getByTestId('project-delete-confirm');
    expect(confirm).toBeDisabled();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('project-delete-confirm-input'), {
      target: { value: 'MemoVault' },
    });
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('proj-1'));
  });

  it('lets you edit the project name and aliases', async () => {
    const onPatch = vi.fn(async () => {});
    renderModal(vi.fn(), onPatch);

    const nameInput = screen.getByTestId('project-name-input');
    expect(nameInput).toHaveValue('MemoVault');
    fireEvent.change(nameInput, { target: { value: 'MemoVault Pro' } });
    fireEvent.blur(nameInput);

    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ name: 'MemoVault Pro' }),
      ),
    );

    expect(screen.getByText('MV')).toBeTruthy();
    const aliasInput = screen.getByTestId('project-alias-input');
    fireEvent.change(aliasInput, { target: { value: 'Vault' } });
    fireEvent.keyDown(aliasInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() =>
      expect(onPatch).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({
          metadata: expect.objectContaining({
            aliases: expect.arrayContaining(['MV', 'Vault']),
          }),
        }),
      ),
    );
  });

  it('shows the LoreBook vignette compiler control with meter', () => {
    renderModal();
    expect(screen.getByTestId('project-modal-lorebook-compile-mobile')).toBeTruthy();
  });
});
