import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console (and could send to error reporting service)
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-text-primary p-8">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <AlertTriangle size={64} className="text-danger" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Something went wrong</h1>
              <p className="text-text-secondary">
                An unexpected error occurred. This might be a temporary issue.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} />
                Try Again
              </Button>

              <details className="text-left bg-surface rounded-lg p-4 border border-border">
                <summary className="cursor-pointer text-sm font-medium mb-2">
                  Error Details (for developers)
                </summary>
                <pre className="text-xs text-text-muted whitespace-pre-wrap overflow-auto max-h-32">
                  {this.state.error && this.state.error.toString()}
                  {this.state.errorInfo && `\n\n${this.state.errorInfo.componentStack}`}
                </pre>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;