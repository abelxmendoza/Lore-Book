import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../test/utils';

import { EvidenceInspectorModal } from './EvidenceInspectorModal';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => true,
}));

describe('EvidenceInspectorModal Knowledge Kernel projection', () => {
  it('opens Demo Mode claims in the shared inspector without an API request', () => {
    render(<EvidenceInspectorModal claimId="mock-self-1" onClose={vi.fn()} />);

    expect(screen.getByText('Why LoreBook shows this')).toBeInTheDocument();
    expect(screen.getByText('LoreBook noticed')).toBeInTheDocument();
    expect(screen.getByText(/process difficult emotions through writing/i)).toBeInTheDocument();
  });
});
