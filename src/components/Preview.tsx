import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { enhance, handlePreviewClick, type PreviewHandlers } from '../lib/enhance';
import type { Theme } from '../lib/theme';

interface PreviewProps extends PreviewHandlers {
  content: string;
  theme: Theme;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}

export function Preview({
  content,
  theme,
  docPath,
  onOpenFile,
  onMessage,
  scrollRef,
  onScroll,
}: PreviewProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const html = useMemo(() => renderMarkdown(content), [content]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    // `html` ya viene sanitizado por DOMPurify dentro de renderMarkdown.
    article.innerHTML = html;
    void enhance(article, { docPath, theme, onOpenFile, onMessage });
  }, [html, docPath, theme, onOpenFile, onMessage]);

  return (
    <div className="preview-host" ref={scrollRef} onScroll={onScroll}>
      <article
        className="markdown-body preview-inner"
        ref={articleRef}
        onClick={(event) => handlePreviewClick(event.nativeEvent, { docPath, onOpenFile, onMessage })}
      />
    </div>
  );
}
