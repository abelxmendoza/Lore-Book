import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchJsonMock = vi.fn();
vi.mock('../../lib/api', () => ({ fetchJson: (...a: unknown[]) => fetchJsonMock(...a) }));

import { IdentityOnboarding } from './IdentityOnboarding';

const DRAFT = {
  identity: { preferredName: 'Abel', occupation: 'Engineer', lifePhase: 'startup', summary: 'A builder in Portland.' },
  people: [{ label: 'Sarah', confidence: 0.9 }],
  places: [{ label: 'Portland', confidence: 0.9 }],
  organizations: [{ label: 'Northwind', confidence: 0.8 }],
  skills: [{ label: 'Engineering', confidence: 0.9 }],
  interests: [],
  goals: [{ label: 'Launch', confidence: 0.8 }],
  projects: [],
  events: [],
  values: [],
};

describe('IdentityOnboarding', () => {
  beforeEach(() => fetchJsonMock.mockReset());

  it('runs narrative → extraction → confirm chips → confirm → done', async () => {
    const user = userEvent.setup();
    fetchJsonMock
      .mockResolvedValueOnce({ draft: DRAFT }) // /narrative
      .mockResolvedValueOnce({ selfCharacterId: 'self-1', completed: true }); // /confirm

    const onComplete = vi.fn();
    render(<IdentityOnboarding onComplete={onComplete} />);

    await user.type(
      screen.getByPlaceholderText(/software engineer in Portland/i),
      "I'm an engineer in Portland building a startup with Sarah.",
    );
    await user.click(screen.getByRole('button', { name: /build my world/i }));

    // Confirmation chips appear from the extracted draft.
    await waitFor(() => expect(screen.getByText('Sarah')).toBeTruthy());
    expect(screen.getByText('Portland')).toBeTruthy();
    expect(screen.getByText('A builder in Portland.')).toBeTruthy();
    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/onboarding/narrative',
      expect.objectContaining({ method: 'POST' }),
    );

    await user.click(screen.getByRole('button', { name: /confirm & build my lorebook/i }));

    await waitFor(() => expect(screen.getByText(/your lorebook is taking shape/i)).toBeTruthy());
    expect(onComplete).toHaveBeenCalled();
    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/onboarding/confirm',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lets the user remove a chip before confirming', async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce({ draft: DRAFT });
    render(<IdentityOnboarding />);

    await user.type(screen.getByPlaceholderText(/software engineer/i), 'I am an engineer with Sarah in Portland.');
    await user.click(screen.getByRole('button', { name: /build my world/i }));

    await waitFor(() => expect(screen.getByText('Sarah')).toBeTruthy());
    await user.click(screen.getByText('Sarah'));
    expect(screen.queryByText('Sarah')).toBeNull();
  });

  it('validates a too-short narrative without calling the API', async () => {
    const user = userEvent.setup();
    render(<IdentityOnboarding />);
    await user.type(screen.getByPlaceholderText(/software engineer/i), 'hi');
    await user.click(screen.getByRole('button', { name: /build my world/i }));
    expect(await screen.findByText(/tell me a little more/i)).toBeTruthy();
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });
});
