import { useI18n } from '@/lib/i18n-react';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  path: string | null;
  hasDoc: boolean;
  dirty: boolean;
  unsaved: boolean;
  cursor: { line: number; column: number };
  words: number;
  chars: number;
  message: { text: string; kind: 'info' | 'error' } | null;
}

const numberFormat = new Intl.NumberFormat();

export function StatusBar({
  path,
  hasDoc,
  dirty,
  unsaved,
  cursor,
  words,
  chars,
  message,
}: StatusBarProps) {
  const { t, plural } = useI18n();

  return (
    <footer className="statusbar row-start-3 flex min-h-[26px] items-center gap-3.5 border-t bg-card px-3 py-1 text-[11.5px] text-muted-foreground select-none">
      {message ? (
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left [direction:rtl]',
            message.kind === 'error' && 'text-destructive',
          )}
        >
          {message.text}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-left [direction:rtl]" title={path ?? ''}>
          {path ?? t('status.noDocument')}
        </span>
      )}

      {hasDoc && (
        <>
          <span
            className={cn(
              'shrink-0 whitespace-nowrap',
              dirty ? 'text-primary' : unsaved ? 'text-muted-foreground' : 'text-success',
            )}
          >
            {dirty ? t('status.dirty') : unsaved ? t('status.new') : t('status.saved')}
          </span>
          <span className="shrink-0 tabular-nums whitespace-nowrap">
            {t('status.cursor', { line: cursor.line, column: cursor.column })}
          </span>
          <span className="shrink-0 tabular-nums whitespace-nowrap">
            {plural('status.words', words, { count: numberFormat.format(words) })}
          </span>
          <span className="shrink-0 tabular-nums whitespace-nowrap">
            {plural('status.chars', chars, { count: numberFormat.format(chars) })}
          </span>
        </>
      )}
    </footer>
  );
}
