import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Changing it (e.g. the page's path) clears the error and tries again. */
  resetKey?: string;
  /** Smaller message, for inside a sheet rather than a whole page. */
  compact?: boolean;
};
type State = { error: Error | null; resetKey?: string };

/**
 * Catches a crash while drawing the screen and shows what went wrong with
 * a way back, instead of a blank app. The message is shown so a screenshot
 * is enough to find the cause.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Screen crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={this.props.compact ? "px-5 py-8 text-center" : "px-5 pt-safe py-16 text-center"}>
        <p className="text-[17px] font-semibold">Something went wrong here</p>
        <p className="mt-2 text-[13px] text-muted">The rest of the app is fine. Your data hasn&apos;t changed.</p>
        <p className="mx-auto mt-3 max-w-xs break-words rounded-xl bg-surface px-3 py-2 font-mono text-[12px] text-subtle">
          {error.message || String(error)}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-canvas"
        >
          Try again
        </button>
      </div>
    );
  }
}
