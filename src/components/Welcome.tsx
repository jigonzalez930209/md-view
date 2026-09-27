import { FilePlus, FolderOpen, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-react';
import { basename, dirname } from '@/lib/paths';
import { Button } from './ui/button';

interface WelcomeProps {
  recents: string[];
  demoAvailable: boolean;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onNew: () => void;
  onOpenDemo: () => void;
  onClearRecents: () => void;
}

/** Markdown logo (not available in Lucide). */
function LogoMarkdown({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="text-foreground">
      <path
        fill="currentColor"
        d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2Zm0 1.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75Z"
      />
      <path
        fill="currentColor"
        d="M3 10.6V5.4h1.35L5.8 7.5l1.45-2.1H8.6v5.2H7.25V7.7L5.8 9.8 4.35 7.7v2.9H3Zm7.4-5.2h1.35v2.5h1.6l-2.27 2.7-2.28-2.7h1.6V5.4Z"
      />
    </svg>
  );
}

export function Welcome({
  recents,
  demoAvailable,
  onOpen,
  onOpenRecent,
  onNew,
  onOpenDemo,
  onClearRecents,
}: WelcomeProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col items-center overflow-auto p-8 select-none">
      <div className="my-auto w-full max-w-[520px]">
        <div className="mb-1.5 flex items-center gap-3">
          <LogoMarkdown />
          <h1 className="text-2xl font-semibold tracking-tight">md-view</h1>
        </div>
        <p className="mb-6 text-[13.5px] text-muted-foreground">{t('welcome.subtitle')}</p>

        <div className="mb-7 flex flex-wrap gap-2">
          <Button onClick={onOpen}>
            <FolderOpen />
            {t('welcome.open')}
          </Button>
          <Button variant="outline" onClick={onNew}>
            <FilePlus />
            {t('welcome.new')}
          </Button>
          {demoAvailable && (
            <Button variant="outline" onClick={onOpenDemo}>
              {t('welcome.demo')}
            </Button>
          )}
        </div>

        {recents.length > 0 && (
          <>
            <div className="mb-2 text-xs font-semibold tracking-wide text-subtle-foreground uppercase">
              {t('welcome.recents')}
            </div>
            <div className="overflow-hidden rounded-xl border">
              {/* The list caps its own height, so the rest of the welcome screen never gets covered. */}
              <div className="max-h-56 overflow-y-auto">
                {recents.map((path) => (
                  <button
                    type="button"
                    key={path}
                    className="block w-full border-b px-3.5 py-2 text-left transition-colors last:border-b-0 hover:bg-accent"
                    title={path}
                    onClick={() => onOpenRecent(path)}
                  >
                    <strong className="block truncate text-[13px] font-medium">
                      {basename(path)}
                    </strong>
                    <span className="block truncate text-[11.5px] text-subtle-foreground [direction:rtl]">
                      {dirname(path)}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 border-t px-3.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                onClick={onClearRecents}
              >
                <Trash2 className="size-3.5" /> {t('common.clearList')}
              </button>
            </div>
          </>
        )}

        <p className="mt-6 rounded-xl border border-dashed p-3.5 text-[12.5px] text-muted-foreground">
          {t('welcome.hintDrag')}
          <br />
          <span className="inline-flex flex-wrap items-center gap-1">
            <Kbd>Ctrl</Kbd> + <Kbd>O</Kbd> {t('welcome.hintOpen')} · <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd>{' '}
            {t('welcome.hintSave')} · <Kbd>Ctrl</Kbd> + <Kbd>1/2/3</Kbd> {t('welcome.hintView')}
          </span>
        </p>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block rounded-md border border-b-2 bg-card px-1.5 py-px font-sans text-[11.5px] text-foreground">
      {children}
    </kbd>
  );
}
