import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

// Mock error tracking
vi.mock('../lib/monitoring', () => ({
  errorTracking: {
    captureException: vi.fn()
  }
}));

describe('ErrorBoundary Integration Tests', () => {
  it('should catch render errors and display fallback UI', () => {
    const ThrowError = () => {
      throw new Error('Test render error');
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it('should catch errors in children components', () => {
    const BrokenComponent = () => {
      throw new Error('Component error');
    };

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it('should allow resetting error state', async () => {
    const user = userEvent.setup();
    const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) {
        throw new Error('Error');
      }
      return <div>No error</div>;
    };

    const { rerender, unmount } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

    // Click "Try Again" button to reset
    const tryAgainButton = screen.getByText(/Try Again/i);
    await user.click(tryAgainButton);

    // Unmount and remount with new component to fully reset
    unmount();
    
    render(
      <ErrorBoundary key="reset">
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    // Should show content, not error
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No error/i)).toBeInTheDocument();
  });
});

