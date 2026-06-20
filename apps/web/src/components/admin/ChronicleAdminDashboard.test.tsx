import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../api/chronicleAdmin', () => ({
  fetchChronicle: vi.fn(),
  acceptChronicleDetection: vi.fn(),
  rejectChronicleDetection: vi.fn(),
  formatChronicleMonth: (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  significanceStars: (n: number) => '★'.repeat(n),
  MilestoneSignificance: { TRIVIAL: 1, MINOR: 2, MODERATE: 3, MAJOR: 4, TRANSFORMATIONAL: 5 },
}));

import { ChronicleAdminDashboard } from './ChronicleAdminDashboard';
import { fetchChronicle } from '../../api/chronicleAdmin';

const mockSnapshot = {
  product: { id: 'p', kind: 'product', name: 'LoreBook', fields: { currentVersion: '0.1.0' } },
  organization: { id: 'o', kind: 'organization', name: 'Omega Technologies', fields: { mission: 'Test' } },
  founder: { id: 'f', kind: 'founder', name: 'Abel Mendoza', fields: { roles: ['Founder'] } },
  stage: { current: 'BETA', progressPercent: 72, label: 'Beta', updatedAt: '2026-06-18T00:00:00Z' },
  visionEvolution: [{ id: 'v1', version: 1, label: 'Version 1 Vision', vision: 'Personal AI memory.', recordedAt: '2025-01-15T00:00:00Z' }],
  milestones: [{
    id: 'ms-1', slug: 'test', title: 'LoreBook Created', summary: 'Started', occurredAt: '2025-01-01T00:00:00Z',
    significance: 5, category: 'founding', stars: 5,
  }],
  chapters: [{ id: 'ch-1', slug: 'idea', title: 'The Idea Era', eraLabel: 'Ch 1', summary: '', sortOrder: 1, milestoneIds: [] }],
  leaderboard: [{ id: 'ms-1', slug: 'test', title: 'LoreBook Created', summary: 'Started', occurredAt: '2025-01-01T00:00:00Z', significance: 5, category: 'founding' }],
  founderStats: { entityId: 'f', name: 'Abel Mendoza', featuresAuthored: 137, majorMilestones: 8, transformationalChanges: 3, visionUpdates: 3 },
  selfNarrative: { title: 'The Story of LoreBook', subtitle: 'Autobiography', chapters: [{ chapterNumber: 1, title: 'The Idea', body: 'Continuity is the product.' }] },
  pendingDetections: [],
  chroniclePolicy: {
    majorOnly: true,
    autoRefreshHours: 6,
    maxPendingQueue: 5,
    maxAutoPromotesPerWeek: 2,
    minAutoPromoteConfidence: 0.88,
  },
  lastRefreshedAt: '2026-06-18T12:00:00Z',
  generatedAt: '2026-06-18T12:00:00Z',
};

describe('ChronicleAdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchChronicle).mockResolvedValue(mockSnapshot as never);
  });

  it('renders chronicle sections after load', async () => {
    render(<ChronicleAdminDashboard />);
    await waitFor(() => expect(screen.getByText('The Story of LoreBook')).toBeInTheDocument());
    expect(screen.getByText('BETA')).toBeInTheDocument();
    expect(screen.getAllByText('Abel Mendoza').length).toBeGreaterThan(0);
    expect(screen.getAllByText('LoreBook Created').length).toBeGreaterThan(0);
    expect(screen.getByText(/Version 1 Vision/i)).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    vi.mocked(fetchChronicle).mockReturnValue(new Promise(() => {}) as never);
    render(<ChronicleAdminDashboard />);
    expect(screen.getByText(/Loading LoreBook Chronicle/i)).toBeInTheDocument();
  });
});
