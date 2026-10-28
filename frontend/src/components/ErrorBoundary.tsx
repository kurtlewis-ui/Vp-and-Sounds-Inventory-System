'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Capture the component stack so the failing component is visible even
    // without opening browser devtools (helps diagnose production crashes).
    this.setState({ info: info?.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-page-bg p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-bold text-text-primary">Something went wrong</h1>
            <p className="text-sm text-text-secondary">
              The app encountered an error. Try refreshing the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, info: null });
                window.location.reload();
              }}
              className="bg-btn-primary text-btn-primary-text px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition"
            >
              Refresh Page
            </button>
            {this.state.error && (
              <p className="text-xs text-text-muted mt-4 break-all">
                {this.state.error.message}
              </p>
            )}
            {this.state.info && (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/30 p-2 text-left text-[10px] leading-snug text-text-muted whitespace-pre-wrap break-all">
                {this.state.info.trim().split('\n').slice(0, 6).join('\n')}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
