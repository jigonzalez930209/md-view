import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last resort for a render crash: shows the error and a way out instead of a
 * blank window. Unsaved work is already kept as drafts by the app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('md-view render error', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <h1 className="text-base font-semibold">{t('error.boundaryTitle')}</h1>
        <p className="max-w-md text-[13px] text-muted-foreground">{t('error.boundaryBody')}</p>
        <pre className="max-h-40 w-full max-w-lg overflow-auto rounded-md border bg-card p-3 text-left text-[11px] whitespace-pre-wrap text-muted-foreground">
          {error.message}
        </pre>
        <Button size="sm" onClick={() => window.location.reload()}>
          {t('common.reload')}
        </Button>
      </div>
    );
  }
}
