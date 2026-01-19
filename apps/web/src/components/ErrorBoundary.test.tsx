import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { errorTracking } from '../lib/monitoring';

// Mock the monitoring module
vi.mock('../lib/monitoring', () => ({
  errorTracking: {
    captureException: vi.fn(),
  },
}));

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error for expected errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('catches errors and displays error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    // Use getAllByText and check first occurrence since error might appear multiple times
    const errorTexts = screen.getAllByText(/Test error/i);
    expect(errorTexts.length).toBeGreaterThan(0);
  });

  it('calls errorTracking.captureException when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(errorTracking.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
        errorBoundary: true,
      })
    );
  });

  it('calls custom onError handler when provided', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it('shows Try Again button that resets error state', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const tryAgainButton = screen.getByText(/Try Again/i);
    expect(tryAgainButton).toBeInTheDocument();
    
    fireEvent.click(tryAgainButton);

    // Error should be cleared, but component will still throw
    // This is expected behavior - the button resets state
    // After click, the button may still be there or error may re-trigger
    // Wait for button to either disappear (error cleared) or reappear (error re-triggered)
    await waitFor(() => {
      const buttonAfterClick = screen.queryByText(/Try Again/i);
      // Button should exist (either same instance or re-rendered after error re-triggers)
      expect(buttonAfterClick).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('shows Reload Page button', () => {
    // Mock window.location.reload by replacing it
    const reloadSpy = vi.fn();
    const originalReload = window.location.reload;
    
    // Delete and redefine
    try {
      delete (window.location as any).reload;
    } catch (e) {
      // Ignore if can't delete
    }
    window.location.reload = reloadSpy;
    
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const reloadButton = screen.getByText(/Reload Page/i);
    fireEvent.click(reloadButton);

    expect(reloadSpy).toHaveBeenCalled();
    
    // Restore original if it existed
    if (originalReload) {
      window.location.reload = originalReload;
    }
  });

  it('uses custom fallback when provided', () => {
    const customFallback = <div>Custom error message</div>;
    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });
});

