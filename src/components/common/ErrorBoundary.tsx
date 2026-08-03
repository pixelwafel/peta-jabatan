import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught Error in React Component Tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 select-none">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-slate-100">Terjadi Kesalahan Aplikasi</h2>
                <p className="text-xs text-slate-400">React Runtime Exception Caught</p>
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-rose-300 overflow-x-auto max-h-48">
              {this.state.error?.toString()}
              {this.state.errorInfo?.componentStack && (
                <div className="mt-2 text-[10px] text-slate-500 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={this.handleReload}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang Halaman</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
