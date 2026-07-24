import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { SagaScreen } from './SagaScreen';

vi.mock('../../hooks/useSaga', () => ({
  useSaga: () => ({
    saga: null,
    refresh: vi.fn(),
    loading: false,
    isMock: true,
  }),
}));

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

describe('SagaScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies all Life Saga content as plain text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <MemoryRouter>
        <SagaScreen />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy all life saga/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = String(writeText.mock.calls[0]?.[0]);
    expect(text).toContain('Life Saga');
    expect(text).toContain('The Creative Renaissance');
    expect(text).toContain('The Studio Year');
    expect(text).toContain('The Leap');
  });
});
