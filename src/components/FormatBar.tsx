import { memo, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import {
  Bold,
  Code,
  Heading1,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  Table,
  Undo2,
} from 'lucide-react';
import {
  insertHorizontalRule,
  insertImage,
  insertLink,
  insertTable,
  redoEdit,
  toggleBold,
  toggleBulletList,
  toggleHeading,
  toggleInlineCode,
  toggleItalic,
  toggleOrderedList,
  toggleQuote,
  toggleTaskList,
  undoEdit,
} from '@/editor/format';
import { useI18n } from '@/lib/i18n-react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface FormatBarProps {
  viewRef: RefObject<EditorView | null>;
}

interface FormatAction {
  label: string;
  run: (view: EditorView) => boolean;
  icon: React.ReactNode;
}

function FormatButton({ action, viewRef }: { action: FormatAction; viewRef: RefObject<EditorView | null> }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={action.label}
          // Prevents the button from taking focus: the editor selection stays intact.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const view = viewRef.current;
            if (view) {
              action.run(view);
              view.focus();
            }
          }}
        >
          {action.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{action.label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Markdown format bar shown above the editor in edit and split modes.
 * Each button acts on the CodeMirror selection.
 */
function FormatBarComponent({ viewRef }: FormatBarProps) {
  const { t } = useI18n();
  const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';

  const groups: FormatAction[][] = [
    [
      { label: t('format.heading'), run: toggleHeading, icon: <Heading1 /> },
      { label: t('format.bold', { mod }), run: toggleBold, icon: <Bold /> },
      { label: t('format.italic', { mod }), run: toggleItalic, icon: <Italic /> },
      { label: t('format.quote'), run: toggleQuote, icon: <Quote /> },
      { label: t('format.code', { mod }), run: toggleInlineCode, icon: <Code /> },
      { label: t('format.link', { mod }), run: insertLink, icon: <Link /> },
    ],
    [
      { label: t('format.bulletList'), run: toggleBulletList, icon: <List /> },
      { label: t('format.orderedList'), run: toggleOrderedList, icon: <ListOrdered /> },
      { label: t('format.taskList'), run: toggleTaskList, icon: <ListTodo /> },
    ],
    [
      { label: t('format.image'), run: insertImage, icon: <Image /> },
      { label: t('format.table'), run: insertTable, icon: <Table /> },
      { label: t('format.rule'), run: insertHorizontalRule, icon: <Minus /> },
    ],
    [
      { label: t('format.undo', { mod }), run: undoEdit, icon: <Undo2 /> },
      { label: t('format.redo', { mod }), run: redoEdit, icon: <Redo2 /> },
    ],
  ];

  return (
    <div
      className="formatbar flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b bg-card px-2 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="toolbar"
      aria-label={t('format.toolbar')}
    >
      {groups.map((group, index) => (
        <div className="flex items-center gap-0.5" key={index}>
          {index > 0 && <Separator orientation="vertical" className="mx-1.5 h-5!" />}
          {group.map((action) => (
            <FormatButton key={action.label} action={action} viewRef={viewRef} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The bar does not depend on anything that changes: it is memoized as a whole. */
export const FormatBar = memo(FormatBarComponent);
