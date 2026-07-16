import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { fetchJson } from '../../lib/api';

import { NarrativeAnchorsBook } from './NarrativeAnchorsBook';

vi.mock('../../lib/api', () => ({ fetchJson: vi.fn() }));
vi.mock('../../hooks/useShouldUseMockData', () => ({ useShouldUseMockData: vi.fn() }));

const anchor = {
  id: 'anchor-1',
  title: 'The college years',
  anchorType: 'school_era' as const,
  confidence: 0.86,
  gravityScore: 0.91,
  startDate: '2018-06-01T12:00:00.000Z',
  endDate: '2022-06-01T12:00:00.000Z',
  entities: [{ id: 'person-1', kind: 'entity', name: 'Maya' }],
  places: [{ id: 'place-1', kind: 'place', name: 'UCSB' }],
  groups: [],
  events: [],
  evidence: [{ id: 'evidence-1', label: 'Maya and UCSB recur together', source: 'co_mention', confidence: 0.9 }],
  provenance: { builtAt: new Date().toISOString(), signals: ['co_mention'] },
};

describe('NarrativeAnchorsBook', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/narrative-anchors');
    vi.mocked(useShouldUseMockData).mockReturnValue(false);
    vi.mocked(fetchJson).mockResolvedValue({ anchors: [anchor] });
  });

  it('explains narrative anchors and shows discovered story threads', async () => {
    render(<NarrativeAnchorsBook />);

    expect(screen.getByText('Narrative Anchors')).toBeInTheDocument();
    expect(screen.getByText(/separate moments belong to the same story/i)).toBeInTheDocument();
    expect(await screen.findByText('The college years')).toBeInTheDocument();
    expect(screen.getByText('2018–2022')).toBeInTheDocument();
    expect(screen.getByText('Strong match')).toBeInTheDocument();
  });

  it('reveals the evidence behind an anchor', async () => {
    render(<NarrativeAnchorsBook />);

    fireEvent.click(await screen.findByRole('button', { name: /the college years/i }));

    expect(screen.getByText('Why Lorekeeper connected this')).toBeInTheDocument();
    expect(screen.getByText('Maya and UCSB recur together')).toBeInTheDocument();
  });

  it('does not repeat equivalent evidence labels', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      anchors: [{
        ...anchor,
        evidence: [
          ...anchor.evidence,
          { ...anchor.evidence[0], id: 'evidence-duplicate', label: 'maya and ucsb recur together' },
        ],
      }],
    });
    render(<NarrativeAnchorsBook />);

    fireEvent.click(await screen.findByRole('button', { name: /the college years/i }));

    expect(screen.getAllByText(/maya and ucsb recur together/i)).toHaveLength(1);
  });

  it('rebuilds the story map from the primary action', async () => {
    render(<NarrativeAnchorsBook />);
    await screen.findByText('The college years');

    fireEvent.click(screen.getByRole('button', { name: /refresh story map/i }));

    await waitFor(() => expect(fetchJson).toHaveBeenCalledWith('/api/narrative-anchors/rebuild', { method: 'POST' }));
  });

  it('renders the designed story map without calling the API in demo mode', async () => {
    vi.mocked(useShouldUseMockData).mockReturnValue(true);

    render(<NarrativeAnchorsBook />);

    expect(await screen.findByText('Building Lorekeeper')).toBeInTheDocument();
    expect(screen.getByText('Demo story')).toBeInTheDocument();
    expect(screen.getByText('The Robotics Pivot')).toBeInTheDocument();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('supports a scoped demo preview while the shared mock policy is off', async () => {
    window.history.replaceState({}, '', '/narrative-anchors?demo=1');

    render(<NarrativeAnchorsBook />);

    expect(await screen.findByText('Demo story')).toBeInTheDocument();
    expect(screen.getByText('Building Lorekeeper')).toBeInTheDocument();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
