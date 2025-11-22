import { Component, type ReactNode } from 'react';
import { errorTracking } from '../lib/monitoring';
import { config } from '../config/env';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development
    if (config.dev.enableConsoleLogs) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // Track error with monitoring service
    errorTracking.captureException(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Update state with error info
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-purple-950 to-black p-4">
          <div className="mx-auto max-w-md rounded-2xl border border-red-500/50 bg-black/40 p-10 text-center shadow-xl">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-red-400 mb-2">Something went wrong</h2>
              <p className="text-white/70 mb-6">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </div>

            <div className="flex gap-3 justify-center mb-6">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors border border-white/20"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
              >
                Reload Page
              </button>
            </div>

            {config.dev.verboseErrors && (
              <details className="mt-6 text-left border-t border-white/10 pt-6">
                <summary className="cursor-pointer text-white/60 text-sm font-medium mb-2">
                  Error Details {this.state.errorInfo ? '(Development Only)' : ''}
                </summary>
                <div className="mt-2 space-y-3">
                  {this.state.error?.stack && (
                    <div>
                      <p className="text-xs text-white/50 mb-1">Stack Trace:</p>
                      <pre className="text-xs text-white/40 overflow-auto max-h-40 p-2 bg-black/40 rounded border border-white/10">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <p className="text-xs text-white/50 mb-1">Component Stack:</p>
                      <pre className="text-xs text-white/40 overflow-auto max-h-40 p-2 bg-black/40 rounded border border-white/10">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <p className="mt-6 text-xs text-white/40">
              {config.prod.enableErrorReporting 
                ? 'This error has been automatically reported to our team.'
                : 'If this problem persists, please contact support.'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

