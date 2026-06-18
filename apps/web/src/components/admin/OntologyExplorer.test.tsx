import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../hooks/useAccountAuthority', () => ({
  useAccountAuthority: vi.fn(() => ({ authority: { role: 'admin' } })),
}));

vi.mock('../../middleware/roleGuard', () => ({
  canAccessAdmin: vi.fn(() => true),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { OntologyExplorer } from './OntologyExplorer';
import { canAccessAdmin } from '../../middleware/roleGuard';
import { fetchJson } from '../../lib/api';

const ontologyResponse = {
  success: true,
  hierarchy: [
    {
      root: 'PERSON',
      characterEligible: true,
      categories: [
        {
          category: 'FAMILY',
          subcategories: [
            { subcategory: 'MOTHER', keywords: ['mother', 'mom'], aliases: ['mamá'] },
          ],
        },
      ],
    },
  ],
  analytics: {
    totals: { glossaryEntries: 80, entitiesWithOntologyTags: 12 },
    highValueKeywords: [{ keyword: 'robotics', entityMatches: 5 }],
    unusedKeywords: ['situationship'],
  },
};

describe('OntologyExplorer (admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canAccessAdmin).mockReturnValue(true);
  });

  it('renders hierarchy and analytics for admins', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(ontologyResponse as never);

    render(<OntologyExplorer />);

    await waitFor(() => expect(screen.getByText('Ontology Explorer')).toBeInTheDocument());
    expect(screen.getByText(/80 glossary entries/i)).toBeInTheDocument();
    expect(screen.getByText(/robotics \(5\)/i)).toBeInTheDocument();
    expect(screen.getByText('PERSON')).toBeInTheDocument();
    expect(screen.getByText('FAMILY')).toBeInTheDocument();
    expect(fetchJson).toHaveBeenCalledWith('/api/ontology');
  });

  it('blocks non-admins with an access message', async () => {
    vi.mocked(canAccessAdmin).mockReturnValue(false);

    render(<OntologyExplorer />);

    expect(screen.getByText(/admin access required/i)).toBeInTheDocument();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('shows an error state when the ontology request fails', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('boom'));

    render(<OntologyExplorer />);

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });
});
