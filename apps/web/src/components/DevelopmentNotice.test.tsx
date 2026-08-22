import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevelopmentNotice } from './DevelopmentNotice';
import * as envConfig from '../config/env';
import {
  latestWhatsNewId,
  WHATS_NEW,
  WHATS_NEW_LEGACY_DISMISS_KEY,
  WHATS_NEW_SEEN_KEY,
  WHATS_NEW_TEST_SUPPRESS,
} from '../data/whatsNew';

vi.mock('../config/env', () => ({
  config: {
    dev: {
      showDevNotice: true,
    },
  },
}));

describe('DevelopmentNotice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (envConfig.config.dev as { showDevNotice: boolean }).showDevNotice = true;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows a welcome for first-time visitors', () => {
    render(<DevelopmentNotice />);
    expect(screen.getByRole('heading', { name: /Welcome to LoreBook/i })).toBeInTheDocument();
    expect(screen.getByText(/Alpha · Not ready for beta/i)).toBeInTheDocument();
    expect(screen.getByText(/not ready for beta testers yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Your life, on a real calendar/i)).toBeInTheDocument();
  });

  it('does not show when disabled in config', () => {
    (envConfig.config.dev as { showDevNotice: boolean }).showDevNotice = false;
    const { container } = render(<DevelopmentNotice />);
    expect(container.firstChild).toBeNull();
  });

  it('does not show after the latest update was seen', () => {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, latestWhatsNewId());
    const { container } = render(<DevelopmentNotice />);
    expect(container.firstChild).toBeNull();
  });

  it('reopens for returning users who only dismissed the old notice', () => {
    localStorage.setItem(WHATS_NEW_LEGACY_DISMISS_KEY, 'true');
    render(<DevelopmentNotice />);
    expect(screen.getByRole('heading', { name: /LoreBook has grown/i })).toBeInTheDocument();
    expect(screen.getByText(/New since your last visit/i)).toBeInTheDocument();
    expect(screen.getByText(/Alpha, not beta/i)).toBeInTheDocument();
  });

  it('reopens when a newer update ships', () => {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, WHATS_NEW[1]?.id ?? '');
    render(<DevelopmentNotice />);
    expect(screen.getByRole('heading', { name: /LoreBook has grown/i })).toBeInTheDocument();
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });

  it('marks the latest update seen on continue', async () => {
    const user = userEvent.setup();
    render(<DevelopmentNotice />);
    await user.click(screen.getByRole('button', { name: /got it, continue to app/i }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Welcome to LoreBook/i })).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe(latestWhatsNewId());
  });

  it('lets automated tests suppress the modal', () => {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, WHATS_NEW_TEST_SUPPRESS);
    const { container } = render(<DevelopmentNotice />);
    expect(container.firstChild).toBeNull();
  });
});
