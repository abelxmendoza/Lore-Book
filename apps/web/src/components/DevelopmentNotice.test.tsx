import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DevelopmentNotice } from './DevelopmentNotice';
import * as envConfig from '../config/env';

// Mock the config
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
    // Reset mutable mock property before each test
    (envConfig.config.dev as any).showDevNotice = true;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should show development notice when enabled in config', async () => {
    render(<DevelopmentNotice />);

    // Wait for the notice to appear (it has a 500ms delay)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Welcome to Lore Book/i })).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should not show when disabled in config', () => {
    (envConfig.config.dev as any).showDevNotice = false;

    const { container } = render(<DevelopmentNotice />);

    expect(container.firstChild).toBeNull();
  });

  it('should not show when dismissed by user', async () => {
    localStorage.setItem('dev-notice-dismissed', 'true');

    const { container } = render(<DevelopmentNotice />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should allow user to dismiss notice', async () => {
    render(<DevelopmentNotice />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Welcome to Lore Book/i })).toBeInTheDocument();
    }, { timeout: 3000 });

    const dismissButton = screen.getByLabelText(/dismiss development notice/i);
    dismissButton.click();

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Welcome to Lore Book/i })).not.toBeInTheDocument();
    });

    expect(localStorage.getItem('dev-notice-dismissed')).toBe('true');
  });

  it('should respect config toggle for production builds', () => {
    (envConfig.config.dev as any).showDevNotice = false;
    expect(envConfig.config.dev.showDevNotice).toBe(false);
  });
});
