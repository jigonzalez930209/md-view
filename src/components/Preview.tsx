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
  /** true si `content` es solo la ventana inicial de un documento enorme. */
  windowed?: boolean;
  /** Tamaño total del documento (para el aviso). */
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

/** Vista de codigo: monoespaciada, con el resaltado del lenguaje si se conoce. */
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
  // Los documentos enormes se muestran por ventana (las primeras lineas).
  const windowed = windowedProp || previewNeedsWindow(content);
  const simplified = isSimplified(content) && !windowed;
  const [html, setHtml] = useState('');
  const [viewOverride, setViewOverride] = useState<PreviewView | null>(null);

  /** Los archivos que no son Markdown se ven como codigo, salvo que se elija lo contrario. */
  const view: PreviewView = viewOverride ?? (markdownDefault ? 'markdown' : 'code');

  // Al cambiar de documento volvemos a la vista que corresponde.
  useEffect(() => {
    setViewOverride(null);
  }, [docPath]);

  /*
   * Documentos enormes: primero se pinta el aviso y el HTML se calcula en el
   * siguiente tick. Asi la ventana aparece con el editor usable en lugar de
   * quedarse congelada mientras markdown-it + DOMPurify hacen su trabajo.
   */
  useEffect(() => {
    let cancelled = false;

    const compose = () => {
      // Documentos enormes: renderizamos solo la ventana inicial.
      const source = windowed ? headWindow(content, PREVIEW_WINDOW_LINES) : content;
      if (view === 'code') {
        setHtml(renderCodeView(source, docPath));
        return;
      }
      // En documentos grandes el nucleo se renderiza en el worker.
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
    if (!article || !html) return;

    // `html` ya viene sanitizado por DOMPurify dentro de renderMarkdown.
    article.innerHTML = html;
    void enhance(article, {
      docPath,
      theme,
      palette,
      diagrams: view === 'markdown' && !simplified && !windowed,
      onOpenFile,
      onMessage,
    });
  }, [html, docPath, theme, palette, simplified, view, onOpenFile, onMessage]);

  const language = languageOfPath(docPath);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="preview-header flex h-10 shrink-0 items-center justify-between gap-2 border-b bg-card px-3">
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
 * Memoizado: los props son estables mientras se escribe, asi el preview (y su
 * HTML ya generado) no se vuelve a reconciliar en cada tecla o movimiento.
 */
export const Preview = memo(PreviewComponent);
