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
};

function renderModal(onDelete = vi.fn()) {
  return render(
    <MemoryRouter>
      <ProjectDetailModal
        project={project}
        onClose={vi.fn()}
        onPatch={vi.fn(async () => {})}
        onDelete={onDelete}
      />
    </MemoryRouter>
  );
}

describe('ProjectDetailModal delete flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('puts Delete in the nav and does not delete on the first click', async () => {
    const onDelete = vi.fn();
    renderModal(onDelete);

    // Header one-click trash should be gone
    expect(screen.queryByTitle('Delete project')).toBeNull();

    // Mobile bottom nav danger action opens the confirm panel (jsdom is mobile-width)
    fireEvent.click(screen.getByRole('button', { name: /delete project/i }));

    expect(await screen.findByText(/Delete MemoVault\?/i)).toBeTruthy();
    expect(screen.getByText(/Step 1 of 2/i)).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('project-delete-continue'));
    expect(await screen.findByText(/Type the name to confirm/i)).toBeTruthy();

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
});
