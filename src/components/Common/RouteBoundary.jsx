import React from 'react';
import { Button, Notice, Surface } from './ui';

export class RouteBoundary extends React.Component {
  state = {};

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: undefined });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Surface className="mx-auto max-w-2xl p-5">
        <h2 className="text-lg font-bold text-[var(--itred-color-charcoal)]">Workspace unavailable</h2>
        <Notice tone="error" className="mt-3">
          This workspace could not be rendered. No business transaction status was changed.
        </Notice>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="quiet" onClick={() => this.setState({ error: undefined })}>
            Retry workspace
          </Button>
          <Button variant="secondary" onClick={this.props.onReturnToDashboard}>
            Return to dashboard
          </Button>
        </div>
      </Surface>
    );
  }
}
