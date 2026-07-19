import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="size-12 rounded-full bg-[var(--accent-red)]/10 grid place-items-center">
          <AlertTriangle className="size-6 text-[var(--accent-red)]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">
            {this.props.fallbackMessage ?? "Une erreur est survenue"}
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {this.state.error?.message ?? "Erreur inconnue"}
          </p>
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="h-8 px-4 rounded-md bg-[var(--bg-elevated)] text-xs font-medium flex items-center gap-2 hover:bg-[var(--border)]"
        >
          <RefreshCw className="size-3.5" /> Réessayer
        </button>
      </div>
    );
  }
}
