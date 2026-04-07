import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/Button";
import { StatePanel } from "./ui/StatePanel";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console (and could send to error reporting service)
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    this.setState({
      error: error,
      errorInfo: errorInfo,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8 text-text-primary">
          <div className="w-full max-w-lg space-y-4">
            <StatePanel
              icon={AlertTriangle}
              title="Something went wrong"
              message="An unexpected error interrupted this view."
              tone="danger"
              action={(
                <Button onClick={this.handleRetry}>
                  Try Again
                </Button>
              )}
              className="min-h-[18rem]"
            />

            <details className="rounded-lg border border-border bg-surface p-4 text-left">
              <summary className="mb-2 cursor-pointer text-sm font-medium">
                Error details
              </summary>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-text-muted">
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo &&
                  `\n\n${this.state.errorInfo.componentStack}`}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
