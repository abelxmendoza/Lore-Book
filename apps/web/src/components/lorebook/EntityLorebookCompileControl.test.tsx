import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EntityLorebookCompileControl } from './EntityLorebookCompileControl';

vi.mock('./KnowledgeBaseCreator', () => ({
  KnowledgeBaseCreator: ({ prefill }: { prefill?: { form?: string; themes?: string } }) => (
    <div data-testid="knowledge-base-creator">
      form:{prefill?.form ?? ''} themes:{prefill?.themes ?? ''}
    </div>
  ),
}));

const fetchEntityLorebookSignalsMock = vi.fn();

vi.mock('../../lib/entityLorebookSignals', async () => {
  const actual = await vi.importActual<typeof import('../../lib/entityLorebookSignals')>(
    '../../lib/entityLorebookSignals',
  );
  return {
    ...actual,
    fetchEntityLorebookSignals: (...args: unknown[]) => fetchEntityLorebookSignalsMock(...args),
  };
});

describe('EntityLorebookCompileControl', () => {
  beforeEach(() => {
    fetchEntityLorebookSignalsMock.mockReset();
    fetchEntityLorebookSignalsMock.mockResolvedValue({
      eventCount: 0,
      uniqueDays: 0,
      wordCount: 0,
    });
  });

  it('renders LoreBook control and content meter', () => {
    render(
      <EntityLorebookCompileControl
        subjectLabel="Marcus"
        signals={{ eventCount: 4, uniqueDays: 3, wordCount: 120 }}
        focus={{ characterId: '00000000-0000-4000-8000-000000000001', themes: 'Marcus' }}
        autoFetchSignals={false}
        testId="entity-compile"
      />,
    );

    expect(screen.getByTestId('entity-compile')).toBeInTheDocument();
    expect(screen.getByTestId('entity-compile-menu')).toBeInTheDocument();
    expect(screen.getByTestId('lorebook-content-meter')).toBeInTheDocument();
  });

  it('opens Compile a LoreBook forms picker with locked forms when empty', async () => {
    render(
      <EntityLorebookCompileControl
        subjectLabel="Northwind Labs"
        signals={{ eventCount: 1, uniqueDays: 1, wordCount: 20 }}
        autoFetchSignals={false}
        testId="entity-compile"
      />,
    );

    fireEvent.click(screen.getByTestId('entity-compile-menu').querySelector('button')!);
    expect(await screen.findByText(/Compile a LoreBook/i)).toBeInTheDocument();
    expect(screen.getByText(/LoreBook forms/i)).toBeInTheDocument();
    expect(screen.getByText(/Content buildup/i)).toBeInTheDocument();
    expect(screen.getByText(/^Vignette$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Short LoreBook$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Locked$/i).length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/^Unlocked$/i)).not.toBeInTheDocument();
  });

  it('fetches related content for location focus and unlocks from real counts', async () => {
    fetchEntityLorebookSignalsMock.mockResolvedValue({
      eventCount: 2,
      uniqueDays: 2,
      wordCount: 48,
    });

    render(
      <EntityLorebookCompileControl
        subjectLabel="Amazon"
        focus={{ locationId: '00000000-0000-4000-8000-000000000099', themes: 'Amazon' }}
        testId="entity-compile"
      />,
    );

    await waitFor(() => {
      expect(fetchEntityLorebookSignalsMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('entity-compile-menu').querySelector('button')!);
    expect(await screen.findByText(/Compile a LoreBook/i)).toBeInTheDocument();
    expect(screen.getByTestId('entity-compile-menu-modal-select-vignette')).not.toBeDisabled();
    expect(screen.getByTestId('entity-compile-menu-modal-select-epic')).toBeDisabled();
    expect(screen.getByText(/^Unlocked$/i)).toBeInTheDocument();
  });
});
