import { memo, useEffect, useRef, useState } from 'react';
import { Code2, FileText } from 'lucide-react';
import { HIGHLIGHT_LIMIT, isSimplified, previewNeedsWindow, renderMarkdownAsync } from '@/lib/markdown';
import { PREVIEW_WINDOW_LINES } from '@/lib/limits';
import { headWindow } from '@/lib/text-tasks';
import { useI18n } from '@/lib/i18n-react';
import { enhance, handlePreviewClick, type PreviewHandlers } from '@/lib/enhance';
import { highlightCode } from '@/lib/highlight';
import { isMarkdownRenderable, isMdxPath, languageOfPath } from '@/lib/paths';
import type { Palette, Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

type PreviewView = 'markdown' | 'code';

interface PreviewProps extends PreviewHandlers {
  content: string;
  /** true if `content` is only the initial window of a huge document. */
  windowed?: boolean;
  /** Total document size (for the notice). */
  totalLength?: number;
  theme: Theme;
  palette: Palette;
  fontSize: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef?: React.RefObject<HTMLElement | null>;
  onScroll?: () => void;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Code view: monospaced, with language highlighting when known. */
function renderCodeView(content: string, docPath: string | null): string {
  const language = languageOfPath(docPath);
  const highlighted =
    content.length <= HIGHLIGHT_LIMIT ? highlightCode(content, language) : null;
  const body = highlighted ?? escapeHtml(content);
  const className = language ? `language-${language}` : '';
  return `<pre class="code-view"><code class="hljs ${className}">${body}</code></pre>`;
}

function PreviewComponent({
  content,
  windowed: windowedProp = false,
  totalLength,
  theme,
  palette,
  fontSize,
  docPath,
  onOpenFile,
  onMessage,
  scrollRef,
  contentRef,
  onScroll,
}: PreviewProps) {
  const { t } = useI18n();
  const articleRef = useRef<HTMLElement | null>(null);
  const mdx = isMdxPath(docPath);
  const markdownDefault = isMarkdownRenderable(docPath);
  // Huge documents are shown windowed (the first lines).
  const windowed = windowedProp || previewNeedsWindow(content);
  const simplified = isSimplified(content) && !windowed;
  /** The HTML travels with its document: right after a tab switch they differ for a moment. */
  const [rendered, setRendered] = useState<{ html: string; docPath: string | null }>({ html: '', docPath });
  const [viewOverride, setViewOverride] = useState<PreviewView | null>(null);

  /** Non-Markdown files are shown as code, unless the opposite is chosen. */
  const view: PreviewView = viewOverride ?? (markdownDefault ? 'markdown' : 'code');

  // When the document changes we return to the matching view.
  useEffect(() => {
    setViewOverride(null);
  }, [docPath]);

  /*
   * Huge documents: the notice is painted first and the HTML is computed on the
   * next tick. That way the window appears with a usable editor instead of
   * freezing while markdown-it + DOMPurify do their work.
   */
  useEffect(() => {
    let cancelled = false;
    const setHtml = (html: string) => setRendered({ html, docPath });

    const compose = () => {
      // Huge documents: we render only the initial window.
      const source = windowed ? headWindow(content, PREVIEW_WINDOW_LINES) : content;
      if (view === 'code') {
        setHtml(renderCodeView(source, docPath));
        return;
      }
      // For large documents the core is rendered in the worker.
      void renderMarkdownAsync(source, { mdx }).then((next) => {
        if (!cancelled) setHtml(next);
      });
    };

    if (!simplified) {
      compose();
      return () => {
        cancelled = true;
      };
    }

    setHtml('');
    const timer = window.setTimeout(compose, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [content, docPath, mdx, simplified, windowed, view]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || !rendered.html) return;

    // `html` is already sanitized by DOMPurify inside renderMarkdown.
    article.innerHTML = rendered.html;
    void enhance(article, {
      docPath: rendered.docPath,
      theme,
      palette,
      diagrams: view === 'markdown' && !simplified && !windowed,
      onOpenFile,
      onMessage,
    });
  }, [rendered, theme, palette, simplified, view, onOpenFile, onMessage]);

  const language = languageOfPath(docPath);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="preview-header flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-card px-3 select-none">
        <span className="truncate text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
          {view === 'code' ? `${t('preview.code')}${language ? ` · ${language}` : ''}` : t('preview.label')}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('preview.viewMarkdown')}
                aria-pressed={view === 'markdown'}
                onClick={() => setViewOverride('markdown')}
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
                  view === 'markdown' && 'bg-accent text-accent-foreground',
                )}
              >
                <FileText className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('preview.viewMarkdown')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('preview.viewCode')}
                aria-pressed={view === 'code'}
                onClick={() => setViewOverride('code')}
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
                  view === 'code' && 'bg-accent text-accent-foreground',
                )}
              >
                <Code2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('preview.viewCode')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        className="preview-scroll min-h-0 flex-1 overflow-auto overscroll-contain"
        ref={scrollRef}
        onScroll={onScroll}
      >
        {(windowed || simplified) && (
          <div className="preview-note sticky top-0 z-10 border-b bg-card/95 px-8 py-1.5 text-[11.5px] text-muted-foreground backdrop-blur">
            {windowed
              ? t('preview.windowed', {
                  mb: Math.round((totalLength ?? content.length) / 1_000_000),
                  lines: new Intl.NumberFormat().format(PREVIEW_WINDOW_LINES),
                })
              : t('preview.simplified')}
          </div>
        )}
        <article
          className="markdown-body mx-auto max-w-[980px] px-8 pt-7 pb-30"
          style={{ fontSize: `${fontSize}px` }}
          ref={(node) => {
            articleRef.current = node;
            if (contentRef) contentRef.current = node;
          }}
          onClick={(event) =>
            handlePreviewClick(event.nativeEvent, { docPath, onOpenFile, onMessage })
          }
        />
      </div>
    </div>
  );
}

/**
 * Memoized: the props are stable while typing, so the preview (and its
 * already generated HTML) is not reconciled again on every keystroke or move.
 */
export const Preview = memo(PreviewComponent);
