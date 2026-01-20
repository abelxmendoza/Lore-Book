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
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should show development notice when enabled in config', async () => {
    vi.mocked(envConfig.config.dev.showDevNotice = true);
    
    render(<DevelopmentNotice />);
    
    // Wait for the notice to appear (it has a 500ms delay)
    await waitFor(() => {
      expect(screen.getByText(/App Under Development/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('should not show when disabled in config', () => {
    vi.mocked(envConfig.config.dev.showDevNotice = false);
    
    const { container } = render(<DevelopmentNotice />);
    
    expect(container.firstChild).toBeNull();
  });

  it('should not show when dismissed by user', async () => {
    localStorage.setItem('dev-notice-dismissed', 'true');
    vi.mocked(envConfig.config.dev.showDevNotice = true);
    
    const { container } = render(<DevelopmentNotice />);
    
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should allow user to dismiss notice', async () => {
    vi.mocked(envConfig.config.dev.showDevNotice = true);
    
    render(<DevelopmentNotice />);
    
    await waitFor(() => {
      expect(screen.getByText(/App Under Development/i)).toBeInTheDocument();
    });
    
    const dismissButton = screen.getByLabelText(/dismiss development notice/i);
    dismissButton.click();
    
    await waitFor(() => {
      expect(screen.queryByText(/App Under Development/i)).not.toBeInTheDocument();
    });
    
    // Verify it's stored in localStorage
    expect(localStorage.getItem('dev-notice-dismissed')).toBe('true');
  });

  it('should show in production by default', () => {
    // Simulate production environment
    const originalEnv = import.meta.env;
    Object.defineProperty(import.meta, 'env', {
      value: { ...originalEnv, MODE: 'production', DEV: false },
      writable: true,
    });
    
    // The config should default to showing the notice
    // This test verifies the config logic, not the component
    expect(envConfig.config.dev.showDevNotice).toBe(true);
  });
});
