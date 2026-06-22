import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterAuditPanel } from './CharacterAuditPanel';

vi.mock('../../store/invalidateEntityCache', () => ({
  invalidateEntityTags: vi.fn(),
}));

vi.mock('../../lib/requestCache', () => ({
  invalidateCache: vi.fn(),
}));

vi.mock('../../api/characterCardAudit', () => ({
  characterCardAuditApi: {
    get: vi.fn(),
  },
}));

import { characterCardAuditApi } from '../../api/characterCardAudit';

describe('CharacterAuditPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing in demo mode', () => {
    const { container } = render(<CharacterAuditPanel demoMode onChanged={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows audit banner when actionable issues exist', async () => {
    vi.mocked(characterCardAuditApi.get).mockResolvedValue({
      userId: 'u1',
      generatedAt: new Date().toISOString(),
      characterCount: 2,
      summary: {
        valid_identity: 0,
        valid_contextual_reference: 0,
        needs_context: 1,
        wrong_domain: 0,
        broken_span: 0,
        duplicate_or_merge_candidate: 0,
        junk_test_data: 1,
        bare_title_invalid: 0,
        needs_identity_resolution: 0,
      },
      results: [
        {
          characterId: '1',
          currentTitle: 'foo',
          status: 'junk_test_data',
          reason: 'Test junk',
          recommendedAction: 'delete',
        },
        {
          characterId: '2',
          currentTitle: 'Sam',
          status: 'needs_context',
          reason: 'Needs story context',
          recommendedAction: 'keep',
        },
      ],
    });

    render(<CharacterAuditPanel onChanged={vi.fn()} />);
    expect(await screen.findByText(/Character card audit/i)).toBeInTheDocument();
    expect(screen.getByText(/2 cards need attention/i)).toBeInTheDocument();
  });
});
