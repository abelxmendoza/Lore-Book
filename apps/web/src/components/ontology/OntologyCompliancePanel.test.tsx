import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OntologyCompliancePanel } from './OntologyCompliancePanel';

vi.mock('../../hooks/useOntologyCompliance', () => ({
  useOntologyCompliance: vi.fn(),
}));

vi.mock('../../api/inference', () => ({
  inferenceApi: { sync: vi.fn() },
}));

import { useOntologyCompliance } from '../../hooks/useOntologyCompliance';

describe('OntologyCompliancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hidden when healthy', () => {
    vi.mocked(useOntologyCompliance).mockReturnValue({
      report: {
        userId: 'u1',
        generatedAt: new Date().toISOString(),
        summary: {
          totalIssues: 0,
          errors: 0,
          warnings: 0,
          byBook: { characters: 0, locations: 0, organizations: 0 },
          healthy: true,
          entityCounts: { characters: 5, locations: 3, organizations: 2 },
        },
        issues: [],
        recommendedFix: { tier: 't1', label: 'Normalize', domains: [] },
      },
      issues: [],
      issueCount: 0,
      errorCount: 0,
      healthy: true,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    const { container } = render(<OntologyCompliancePanel book="characters" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows issues when not healthy', () => {
    vi.mocked(useOntologyCompliance).mockReturnValue({
      report: {
        userId: 'u1',
        generatedAt: new Date().toISOString(),
        summary: {
          totalIssues: 1,
          errors: 1,
          warnings: 0,
          byBook: { characters: 1, locations: 0, organizations: 0 },
          healthy: false,
          entityCounts: { characters: 5, locations: 3, organizations: 2 },
        },
        issues: [
          {
            id: 'c1',
            book: 'characters',
            name: 'Find My',
            rule: 'entity_classifier.wrong_book',
            issue: 'Should not be a character',
            severity: 'error',
            fixAction: 'manual_review',
          },
        ],
        recommendedFix: { tier: 't1', label: 'Run inference', domains: ['locations'] },
      },
      issues: [
        {
          id: 'c1',
          book: 'characters',
          name: 'Find My',
          rule: 'entity_classifier.wrong_book',
          issue: 'Should not be a character',
          severity: 'error',
          fixAction: 'manual_review',
        },
      ],
      issueCount: 1,
      errorCount: 1,
      healthy: false,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    render(<OntologyCompliancePanel book="characters" hideWhenHealthy={false} />);
    expect(screen.getByText(/lexical compliance/i)).toBeInTheDocument();
    expect(screen.getByText(/1 issue/i)).toBeInTheDocument();
  });
});
