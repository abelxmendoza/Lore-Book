import { beforeEach, describe, expect, it, vi } from 'vitest';

import { profileClaimsApi } from '../../api/profileClaims';
import { fireEvent, render, screen, waitFor } from '../../test/utils';

import { ClaimsInbox } from './ClaimsInbox';

vi.mock('../../api/profileClaims', () => ({
  profileClaimsApi: {
    list: vi.fn(),
    confirm: vi.fn(),
    reject: vi.fn(),
  },
}));

const claim = {
  id: 'claim-1',
  claim_type: 'role',
  claim_text: 'Worked as a deployment technician',
  source: 'resume',
  source_detail: null,
  verified_status: 'unverified',
  confidence: 0.8,
  user_confirmed: false,
  user_notes: null,
  first_seen_at: '2099-01-01T00:00:00.000Z',
  metadata: {},
};

describe('ClaimsInbox', () => {
  beforeEach(() => {
    let listCalls = 0;
    vi.mocked(profileClaimsApi.list).mockImplementation(async () => ({
      success: true,
      claims: listCalls++ === 0 ? [claim] : [],
      stats: { total: listCalls === 1 ? 1 : 0, unverified: listCalls === 1 ? 1 : 0, verified: 0 },
    }));
    vi.mocked(profileClaimsApi.confirm).mockResolvedValue({
      ...claim,
      user_confirmed: true,
      verified_status: 'verified',
    });
    vi.mocked(profileClaimsApi.reject).mockResolvedValue({
      ...claim,
      verified_status: 'downgraded',
    });
  });

  it('confirms a document claim and gives visible action feedback', async () => {
    const onUpdated = vi.fn();
    render(<ClaimsInbox onUpdated={onUpdated} />);

    const confirm = await screen.findByRole('button', { name: /confirm claim/i });
    fireEvent.click(confirm);

    expect(profileClaimsApi.confirm).toHaveBeenCalledWith('claim-1');
    expect(confirm).toHaveAttribute('aria-busy', 'true');

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /confirm claim/i })).not.toBeInTheDocument();
  });
});
