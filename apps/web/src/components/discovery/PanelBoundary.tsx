import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PanelBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-4 py-16 px-6 text-center">
          <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-8 w-8 text-red-400/70" />
          </div>
          <div>
            <p className="text-white/70 font-medium">This panel couldn't load</p>
            <p className="text-white/40 text-sm mt-1 max-w-sm">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
            <Link
              to="/discovery"
              className="text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              ← Back to Discovery
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
