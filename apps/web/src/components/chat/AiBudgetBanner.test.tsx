import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiBudgetBanner, resetAiBudgetBannerDismissed } from './AiBudgetBanner';

const budgetBase = {
  enabled: true,
  monthlyLimitUsd: 5,
  spentUsd: 4,
  remainingUsd: 1,
  percentUsed: 80,
  exhausted: false,
  warning: true,
  resetsAt: '2026-07-01T00:00:00.000Z',
};

describe('AiBudgetBanner', () => {
  beforeEach(() => {
    resetAiBudgetBannerDismissed();
  });

  it('renders compact warning and dismisses for the session', async () => {
    const user = userEvent.setup();
    render(<AiBudgetBanner budget={budgetBase} />);

    expect(screen.getByTestId('ai-budget-warning-banner')).toBeInTheDocument();
    expect(screen.getByText(/AI spend 80% of \$5\.00/)).toBeInTheDocument();

    await user.click(screen.getByTestId('ai-budget-warning-banner-dismiss'));
    expect(screen.queryByTestId('ai-budget-warning-banner')).not.toBeInTheDocument();
  });

  it('prioritizes exhausted state over warning', () => {
    render(
      <AiBudgetBanner
        budget={{
          ...budgetBase,
          spentUsd: 5,
          remainingUsd: 0,
          percentUsed: 100,
          exhausted: true,
        }}
      />,
    );

    expect(screen.getByTestId('ai-budget-exhausted-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-budget-warning-banner')).not.toBeInTheDocument();
  });

  it('renders free tier notice when usage is high', async () => {
    const user = userEvent.setup();
    render(
      <AiBudgetBanner
        usage={{
          aiRequestsCount: 27,
          aiLimit: 30,
          isPremium: false,
        }}
      />,
    );

    expect(screen.getByTestId('ai-budget-free-tier-banner')).toBeInTheDocument();
    await user.click(screen.getByTestId('ai-budget-free-tier-banner-dismiss'));
    expect(screen.queryByTestId('ai-budget-free-tier-banner')).not.toBeInTheDocument();
  });

  it('renders nothing when budget guard is disabled', () => {
    const { container } = render(
      <AiBudgetBanner
        budget={{
          ...budgetBase,
          enabled: false,
          warning: false,
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
