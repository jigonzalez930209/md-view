import { memo, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  RotateCw,
  X,
} from 'lucide-react';
import type { FolderTree, TreeEntry } from '@/lib/backend';
import { useI18n } from '@/lib/i18n-react';
import { MARKDOWN_EXTENSIONS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const CODE_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'astro', 'py', 'rb', 'go', 'rs', 'java',
  'kt', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'swift', 'lua', 'sh', 'bash', 'zsh', 'ps1',
  'sql', 'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css',
]);

interface FileTreeProps {
  tree: FolderTree;
  activePath: string | null;
  width: number;
  onOpenFile: (path: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

function iconFor(entry: TreeEntry, expanded: boolean) {
  if (entry.kind === 'dir') {
    return expanded ? (
      <FolderOpen className="size-3.5 shrink-0 text-subtle-foreground" />
    ) : (
      <Folder className="size-3.5 shrink-0 text-subtle-foreground" />
    );
  }

  const extension = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (MARKDOWN_EXTENSIONS.includes(extension)) {
    return <FileText className="size-3.5 shrink-0 text-primary" />;
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return <FileCode className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

/** Looks up the path in the tree and returns the folders that contain it. */
function ancestorsOf(root: TreeEntry, path: string): string[] | null {
  for (const child of root.children ?? []) {
    if (child.path === path) return [root.path];
    if (child.kind === 'dir') {
      const found = ancestorsOf(child, path);
      if (found) return [root.path, ...found];
    }
  }
  return null;
}

interface NodeProps {
  entry: TreeEntry;
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}

function Node({ entry, depth, expanded, activePath, onToggle, onOpenFile }: NodeProps) {
  const { t } = useI18n();
  const isDir = entry.kind === 'dir';
  const isExpanded = isDir && expanded.has(entry.path);
  const isActive = !isDir && entry.path === activePath;
  const disabled = !isDir && !entry.isText;

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-expanded={isDir ? isExpanded : undefined}
        aria-selected={isActive}
        disabled={disabled}
        title={disabled ? t('tree.notText', { path: entry.path }) : entry.path}
        onClick={() => (isDir ? onToggle(entry.path) : onOpenFile(entry.path))}
        className={cn(
          'flex w-full cursor-pointer items-center gap-1 rounded-md py-[3px] pr-2 text-left text-[12.5px] text-foreground/90 transition-colors',
          'hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[2px] focus-visible:outline-none',
          isActive && 'bg-accent font-medium text-accent-foreground',
          disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        )}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
      >
        {isDir ? (
          isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-subtle-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-subtle-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {iconFor(entry, isExpanded)}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      </button>

      {isExpanded &&
        entry.children?.map((child) => (
          <Node
            key={child.path}
            entry={child}
            depth={depth + 1}
            expanded={expanded}
            activePath={activePath}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
          />
        ))}
    </>
  );
}

function compactPath(path: string): string {
  return path
    .replace(/^\/home\/[^/]+(?:\/|$)/, '~/')
    .replace(/^\/Users\/[^/]+(?:\/|$)/, '~/')
    .replace(/^\/root(?:\/|$)/, '~/');
}

/**
 * VS Code-style file explorer: collapsible folders and files.
 * Only text files can be opened; the rest stay disabled.
 */
function FileTreeComponent({ tree, activePath, width, onOpenFile, onRefresh, onClose }: FileTreeProps) {
  const { t, plural } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([tree.root.path]));

  // When the folder changes, we start with the root expanded.
  useEffect(() => {
    setExpanded(new Set([tree.root.path]));
  }, [tree.root.path]);

  // If the active file comes from elsewhere, we expand its folders.
  useEffect(() => {
    if (!activePath) return;
    const chain = ancestorsOf(tree.root, activePath);
    if (!chain) return;
    setExpanded((current) => {
      const next = new Set(current);
      let changed = false;
      for (const path of chain) {
        if (!next.has(path)) {
          next.add(path);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [activePath, tree]);

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const fileCount = useMemo(() => {
    let total = 0;
    const walk = (entry: TreeEntry) => {
      if (entry.kind === 'file') total += 1;
      entry.children?.forEach(walk);
    };
    walk(tree.root);
    return total;
  }, [tree]);

  return (
    <aside
      className="file-tree flex min-h-0 shrink-0 flex-col bg-card select-none"
      style={{ width }}
      aria-label={t('tree.label')}
    >
      {/* Top band (same height as the tab strip) with the path. */}
      <div
        className="flex h-[29px] shrink-0 items-center px-3 text-[10.5px] text-subtle-foreground"
        title={tree.root.path}
      >
        <span className="min-w-0 truncate [direction:rtl]">
          <bdi dir="ltr">{compactPath(tree.root.path)}</bdi>
        </span>
      </div>

      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase"
          title={tree.root.path}
        >
          {tree.root.name}
        </span>
        <span
          className="shrink-0 text-[11px] text-subtle-foreground"
          title={plural('tree.count', fileCount)}
        >
          {fileCount}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t('tree.reload')}
              onClick={onRefresh}
            >
              <RotateCw className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('tree.reload')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t('tree.close')}
              onClick={onClose}
            >
              <X className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('tree.close')}</TooltipContent>
        </Tooltip>
      </div>

      {tree.truncated && (
        <p className="shrink-0 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
          {t('tree.truncated')}
        </p>
      )}

      <div role="tree" className="min-h-0 flex-1 overflow-auto p-1">
        {tree.root.children?.map((child) => (
          <Node
            key={child.path}
            entry={child}
            depth={0}
            expanded={expanded}
            activePath={activePath}
            onToggle={toggle}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </aside>
  );
}

/** Memoized: with large repos it does not re-render on every keystroke or cursor move. */
export const FileTree = memo(FileTreeComponent);
