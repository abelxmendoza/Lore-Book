import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DISCOVERY_DEVELOPMENT_NOTICE_DISMISSED_KEY,
  DiscoveryDevelopmentNotice,
} from './DiscoveryDevelopmentNotice';

describe('DiscoveryDevelopmentNotice', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('warns users that Discovery Hub development is on hold', () => {
    render(<DiscoveryDevelopmentNotice />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Development is currently on hold')).toBeInTheDocument();
    expect(screen.getByText(/some panels may be incomplete/i)).toBeInTheDocument();
  });

  it('dismisses the notice for the rest of the browser session', () => {
    const { unmount } = render(<DiscoveryDevelopmentNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Discovery Hub' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(DISCOVERY_DEVELOPMENT_NOTICE_DISMISSED_KEY)).toBe('true');

    unmount();
    render(<DiscoveryDevelopmentNotice />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can also be dismissed with the close button', () => {
    render(<DiscoveryDevelopmentNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Discovery Hub development notice' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
