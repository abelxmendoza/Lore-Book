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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ErrorBoundary.tsx:27',message:'ErrorBoundary caught error - CRITICAL',data:{errorMessage:error.message,errorStack:error.stack,componentStack:errorInfo.componentStack,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

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
                  {this.state.error?.message && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-white/50">Error Message:</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(this.state.error?.message || '');
                          }}
                          className="text-xs text-primary hover:text-primary/80 transition-colors"
                          title="Copy error message"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="text-xs text-white/40 overflow-auto max-h-40 p-2 bg-black/40 rounded border border-white/10 select-all">
                        {this.state.error.message}
                      </pre>
                    </div>
                  )}
                  {this.state.error?.stack && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-white/50">Stack Trace:</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(this.state.error?.stack || '');
                          }}
                          className="text-xs text-primary hover:text-primary/80 transition-colors"
                          title="Copy stack trace"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="text-xs text-white/40 overflow-auto max-h-40 p-2 bg-black/40 rounded border border-white/10 select-all">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-white/50">Component Stack:</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(this.state.errorInfo?.componentStack || '');
                          }}
                          className="text-xs text-primary hover:text-primary/80 transition-colors"
                          title="Copy component stack"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="text-xs text-white/40 overflow-auto max-h-40 p-2 bg-black/40 rounded border border-white/10 select-all">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-white/50">Full Error Details (JSON):</p>
                      <button
                        onClick={() => {
                          const errorData = {
                            message: this.state.error?.message,
                            stack: this.state.error?.stack,
                            componentStack: this.state.errorInfo?.componentStack,
                            name: this.state.error?.name,
                            timestamp: new Date().toISOString()
                          };
                          navigator.clipboard.writeText(JSON.stringify(errorData, null, 2));
                        }}
                        className="text-xs text-primary hover:text-primary/80 transition-colors"
                        title="Copy all error details as JSON"
                      >
                        Copy All
                      </button>
                    </div>
                    <pre className="text-xs text-white/40 overflow-auto max-h-40 p-2 bg-black/40 rounded border border-white/10 select-all">
                      {JSON.stringify({
                        message: this.state.error?.message,
                        stack: this.state.error?.stack,
                        componentStack: this.state.errorInfo?.componentStack,
                        name: this.state.error?.name
                      }, null, 2)}
                    </pre>
                  </div>
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

