import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { DatabaseOpsBanner } from './DatabaseOpsBanner';
import {
  EMPTY_CONNECTION_HINTS,
  EMPTY_UPGRADE_SNAPSHOT,
  type DbHealthPayload,
} from '../../lib/dbHealth';

const mockUseDatabaseOpsHealth = vi.fn();
const mockUseMockData = vi.fn();

vi.mock('../../hooks/useDatabaseOpsHealth', () => ({
  useDatabaseOpsHealth: () => mockUseDatabaseOpsHealth(),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => mockUseMockData(),
}));

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

function warnPayload(overrides: Partial<DbHealthPayload> = {}): DbHealthPayload {
  return {
    status: 'warn',
    missingTables: [],
    lastSchemaSync: null,
    storage: {
      status: 'warn',
      databaseBytes: 420_000_000,
      walBytes: null,
      quotaBytes: 524_288_000,
      utilizationRatio: 0.8,
      checkedAt: new Date().toISOString(),
    },
    upgrade: EMPTY_UPGRADE_SNAPSHOT,
    connection: EMPTY_CONNECTION_HINTS,
    ...overrides,
  };
}

describe('DatabaseOpsBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockUseMockData.mockReturnValue({ backendUnavailable: false });
  });

  it('renders nothing when ops are ok', () => {
    mockUseDatabaseOpsHealth.mockReturnValue({
      loading: false,
      showBanner: false,
      payload: null,
    });
    const { container } = render(<DatabaseOpsBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows storage warn banner for admins', () => {
    mockUseDatabaseOpsHealth.mockReturnValue({
      loading: false,
      showBanner: true,
      payload: warnPayload(),
    });
    render(<DatabaseOpsBanner />);
    expect(screen.getByTestId('database-ops-banner')).toHaveAttribute('data-severity', 'warn');
    expect(screen.getByText(/80%/)).toBeInTheDocument();
  });

  it('shows upgrade warnings when storage is ok', () => {
    mockUseDatabaseOpsHealth.mockReturnValue({
      loading: false,
      showBanner: true,
      payload: warnPayload({
        storage: {
          status: 'ok',
          databaseBytes: 100,
          walBytes: 0,
          quotaBytes: 524_288_000,
          utilizationRatio: 0.0001,
          checkedAt: new Date().toISOString(),
        },
        upgrade: {
          status: 'warn',
          postgresVersion: '15.8',
          postgresMajor: 15,
          cronJobRunDetailsRows: 120_000,
          deprecatedExtensions: [],
          warnings: ['pg_cron.job_run_details has 120,000 rows — consider pruning before a Postgres upgrade.'],
        },
      }),
    });
    render(<DatabaseOpsBanner />);
    expect(screen.getByText(/pg_cron/i)).toBeInTheDocument();
  });

  it('dismisses for the session until severity escalates', () => {
    mockUseDatabaseOpsHealth.mockReturnValue({
      loading: false,
      showBanner: true,
      payload: warnPayload(),
    });
    const { rerender } = render(<DatabaseOpsBanner />);
    fireEvent.click(screen.getByLabelText('Dismiss database ops warning'));
    expect(screen.queryByTestId('database-ops-banner')).not.toBeInTheDocument();

    mockUseDatabaseOpsHealth.mockReturnValue({
      loading: false,
      showBanner: true,
      payload: warnPayload({
        storage: {
          status: 'critical',
          databaseBytes: 500_000_000,
          walBytes: null,
          quotaBytes: 524_288_000,
          utilizationRatio: 0.95,
          checkedAt: new Date().toISOString(),
        },
      }),
    });
    rerender(<DatabaseOpsBanner />);
    expect(screen.getByTestId('database-ops-banner')).toHaveAttribute('data-severity', 'critical');
  });
});
