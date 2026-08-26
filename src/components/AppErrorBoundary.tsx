import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
  /** Changing this value clears a page-level failure after navigation. */
  resetKey?: React.Key;
  context?: string;
  compact?: boolean;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Homebase] UI render failed', error, info.componentStack);
  }

  componentDidUpdate(previousProps: AppErrorBoundaryProps): void {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const context = this.props.context ?? 'this view';
    return (
      <div className="ui-app-error" data-compact={this.props.compact ? 'true' : 'false'} role="alert">
        <AlertTriangle size={20} aria-hidden="true" />
        <div className="ui-app-error__copy">
          <strong>Could not open {context}</strong>
          <p>
            The rest of your data is unchanged. Try again; if the extension was just updated,
            reload this page so it can use the current files.
          </p>
          <details>
            <summary>Technical detail</summary>
            <code>{error.message}</code>
          </details>
          <div className="ui-app-error__actions">
            <button type="button" className="ui-button ui-button--secondary" onClick={this.retry}>
              <RotateCcw size={13} /> Try again
            </button>
            <button type="button" className="ui-button ui-button--primary" onClick={() => window.location.reload()}>
              <RefreshCw size={13} /> Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
