import { GitBranch } from 'lucide-react';
import type { ChangeStats } from '@/editor/changes';
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
  /** Git branch of the document, null outside a repository. */
  branch: string | null;
  /** Changed lines against git HEAD (or the last save). */
  changes: ChangeStats | null;
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
  branch,
  changes,
}: StatusBarProps) {
  const { t, plural } = useI18n();
  const changed = changes !== null && changes.added + changes.modified + changes.removed > 0;

  return (
    <footer className="statusbar row-start-3 flex min-h-[26px] items-center gap-3.5 border-t bg-card px-3 py-1 text-[11.5px] text-muted-foreground select-none">
      {message ? (
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left [direction:rtl]',
            message.kind === 'error' && 'text-destructive',
          )}
        >
          <bdi dir="ltr">{message.text}</bdi>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-left [direction:rtl]" title={path ?? ''}>
          <bdi dir="ltr">{path ?? t('status.noDocument')}</bdi>
        </span>
      )}

      {hasDoc && (
        <>
          {branch && (
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap" title={t('status.branch', { branch })}>
              <GitBranch className="size-3.5" />
              {branch}
            </span>
          )}
          {changed && (
            <span
              className="flex shrink-0 gap-1.5 tabular-nums whitespace-nowrap"
              title={branch ? t('status.changesGit', { branch }) : t('status.changesSaved')}
            >
              {changes.added > 0 && <span className="text-success">+{changes.added}</span>}
              {changes.modified > 0 && <span className="text-primary">~{changes.modified}</span>}
              {changes.removed > 0 && <span className="text-destructive">−{changes.removed}</span>}
            </span>
          )}
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
