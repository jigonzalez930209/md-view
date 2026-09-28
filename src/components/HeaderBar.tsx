import { useEffect, useState } from 'react';
import {
  ChevronDown,
  Monitor,
  Columns2,
  Copy,
  Eye,
  FileCode,
  FileImage,
  FileText,
  FileType,
  Files,
  FolderOpen,
  FolderTree,
  Image,
  Images,
  Info,
  Menu,
  Minus,
  Moon,
  Palette as PaletteIcon,
  PanelLeft,
  PanelRight,
  Pencil,
  Save,
  SaveAll,
  Shapes,
  Settings,
  Share2,
  Square,
  SquarePlus,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-react';
import { basename, dirname } from '@/lib/paths';
import * as backend from '@/lib/backend';
import { EXPORT_FORMATS, type ExportFormat } from '@/lib/export';
import { PALETTES, type ExplorerSide, type Palette } from '@/lib/theme';
import type { ThemeMode } from '@/lib/prefs';
import type { ViewMode } from '@/lib/view';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface HeaderBarProps {
  docName: string | null;
  docPath: string | null;
  dirty: boolean;
  words: number;
  chars: number;
  eol: '\n' | '\r\n';
  bom: boolean;
  mode: ViewMode;
  themeMode: ThemeMode;
  palette: Palette;
  recents: string[];
  canCloseTab: boolean;
  hasTabs: boolean;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onNewTab: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onCloseTab: () => void;
  onModeChange: (mode: ViewMode) => void;
  onThemeModeChange: (mode: ThemeMode) => void;
  onPaletteChange: (palette: Palette) => void;
  pdfLight: boolean;
  onPdfLightChange: (value: boolean) => void;
  onOpenSettings: () => void;
  onOpenFolder: () => void;
  treeOpen: boolean;
  canToggleTree: boolean;
  onToggleTree: () => void;
  explorerSide: ExplorerSide;
  onExplorerSideChange: (side: ExplorerSide) => void;
  onExport: (format: ExportFormat) => void;
  onClearRecents: () => void;
}

/** Icon for each export format. */
const EXPORT_ICONS: Record<ExportFormat, React.ReactNode> = {
  pdf: <FileType />,
  html: <FileCode />,
  'png-pages': <Files />,
  'png-full': <Image />,
  jpg: <FileImage />,
  webp: <Images />,
  svg: <Shapes />,
  txt: <FileText />,
};

function compactHome(path: string): string {
  return path
    .replace(/^\/home\/[^/]+(?:\/|$)/, '~/')
    .replace(/^\/Users\/[^/]+(?:\/|$)/, '~/')
    .replace(/^\/root(?:\/|$)/, '~/');
}

/** Appearance choices keep the menu open so several can be tried in a row. */
function keepOpen(event: Event) {
  event.preventDefault();
}

function PaletteSwatch({ swatch }: { swatch: [string, string, string] }) {
  return (
    <span className="flex items-center gap-0.5">
      {swatch.map((color) => (
        <span
          key={color}
          className="size-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/15"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

export function HeaderBar({
  docName,
  docPath,
  dirty,
  words,
  chars,
  eol,
  bom,
  mode,
  themeMode,
  palette,
  recents,
  canCloseTab,
  hasTabs,
  onOpen,
  onOpenRecent,
  onNewTab,
  onSave,
  onSaveAs,
  onCloseTab,
  onModeChange,
  onThemeModeChange,
  onPaletteChange,
  pdfLight,
  onPdfLightChange,
  onOpenSettings,
  onOpenFolder,
  treeOpen,
  canToggleTree,
  onToggleTree,
  explorerSide,
  onExplorerSideChange,
  onExport,
  onClearRecents,
}: HeaderBarProps) {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';

  // The window has no frame: we track the real state to choose the icon.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void backend.isWindowMaximized().then((value) => {
      if (!disposed) setMaximized(value);
    });
    void backend.onWindowResized(() => {
      void backend.isWindowMaximized().then((value) => {
        if (!disposed) setMaximized(value);
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const subtitle = docName
    ? docPath
      ? compactHome(dirname(docPath))
      : t('header.infoNew')
    : t('header.tagline');

  return (
    <header
      className={cn(
        'headerbar row-start-1 grid min-h-[47px] grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-1.5 bg-card py-1 pr-1.5 pl-2.5 select-none',
        !hasTabs && 'border-b',
      )}
      /* "deep" so the whole bar drags the window (buttons and links still take
         the click); Tauri also maximizes on double click. */
      data-tauri-drag-region="deep"
    >
      <div className="flex items-center gap-0.5">
        <div className="flex items-center">
          <Button
            variant="ghost"
            className="h-8 rounded-r-none pr-1 text-[13.5px] font-semibold text-foreground"
            onClick={onOpen}
            title={t('header.openFileTitle', { mod })}
          >
            {t('header.open')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-ml-0.5 rounded-l-none text-muted-foreground"
                aria-label={t('header.recents')}
                title={t('header.recents')}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuItem onSelect={onOpen}>
                <FolderOpen />
                {t('header.openFile')}
                <DropdownMenuShortcut>{mod}+O</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenFolder}>
                <FolderTree />
                {t('header.openFolder')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {recents.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-subtle-foreground">
                  {t('header.recentsEmpty')}
                </p>
              ) : (
                <>
                  <DropdownMenuLabel>{t('header.recentsSection')}</DropdownMenuLabel>
                  {recents.map((path) => (
                    <DropdownMenuItem
                      key={path}
                      title={path}
                      onSelect={() => onOpenRecent(path)}
                      className="flex-col items-start gap-0"
                    >
                      <span className="w-full truncate text-[13px] font-medium">
                        {basename(path)}
                      </span>
                      <span className="w-full truncate text-[11.5px] text-subtle-foreground [direction:rtl]">
                        <bdi dir="ltr">{compactHome(dirname(path))}</bdi>
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onClearRecents}
                    className="text-muted-foreground focus:text-destructive"
                  >
                    <Trash2 />
                    {t('header.clearRecents')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              aria-label={t('header.newTab')}
              onClick={onNewTab}
            >
              <SquarePlus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('header.newTabTitle', { mod })}</TooltipContent>
        </Tooltip>
      </div>

      <div
        className="min-w-0 px-2 text-center leading-tight"
        title={docPath ?? docName ?? undefined}
      >
        <div className="flex items-center justify-center gap-1.5 text-sm font-semibold">
          {dirty && (
            <span
              className="size-[7px] shrink-0 rounded-full bg-primary"
              aria-label={t('header.unsavedChanges')}
            />
          )}
          <span className="max-w-[52ch] truncate">{docName ?? 'md-view'}</span>
        </div>
        <div
          className={cn(
            'truncate text-[11.5px] text-subtle-foreground',
            docPath && '[direction:rtl]',
          )}
        >
          <bdi dir="ltr">{subtitle}</bdi>
        </div>
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('header.info')}
                >
                  <Info />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('header.info')}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-auto max-w-105 min-w-70">
            <div className="truncate text-[13.5px] font-semibold">
              {docName ?? t('header.noDocument')}
            </div>
            {docPath && (
              <div className="mt-0.5 text-[11.5px] break-all text-subtle-foreground">{docPath}</div>
            )}
            <div className="mt-2 text-[11.5px] text-muted-foreground">
              {t('header.infoStats', {
                words: new Intl.NumberFormat().format(words),
                chars: new Intl.NumberFormat().format(chars),
              })}
            </div>
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              {eol === '\r\n' ? 'CRLF' : 'LF'} · UTF-8{bom ? ' con BOM' : ''}
              {docName &&
                ` · ${dirty ? t('header.infoDirty') : docPath ? t('header.infoSaved') : t('header.infoNew')}`}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              aria-label={t('header.menu')}
            >
              <Menu />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={onNewTab}>
              <SquarePlus />
              {t('header.newTab')}
              <DropdownMenuShortcut>{mod}+T</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canCloseTab} onSelect={onCloseTab}>
              <X />
              {t('header.closeTab')}
              <DropdownMenuShortcut>{mod}+W</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={treeOpen}
              disabled={!canToggleTree}
              onCheckedChange={() => onToggleTree()}
              onSelect={(event) => event.preventDefault()}
            >
              <PanelRight />
              {t('header.explorer')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem disabled={!docName} onSelect={onSave}>
              <Save />
              {t('header.save')}
              <DropdownMenuShortcut>{mod}+S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!docName} onSelect={onSaveAs}>
              <SaveAll />
              {t('header.saveAs')}
              <DropdownMenuShortcut>{mod}+Shift+S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('header.view')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={mode} onValueChange={(value) => onModeChange(value as ViewMode)}>
              <DropdownMenuRadioItem value="edit" disabled={!docName}>
                <Pencil />
                {t('header.viewEdit')}
                <DropdownMenuShortcut>{mod}+1</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="split" disabled={!docName}>
                <Columns2 />
                {t('header.viewSplit')}
                <DropdownMenuShortcut>{mod}+2</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="preview" disabled={!docName}>
                <Eye />
                {t('header.viewPreview')}
                <DropdownMenuShortcut>{mod}+3</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!docName}>
                <Share2 />
                {t('header.export')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                {EXPORT_FORMATS.map((format) => (
                  <DropdownMenuItem
                    key={format.id}
                    disabled={!docName}
                    onSelect={() => onExport(format.id)}
                    className="items-start"
                  >
                    <span className="mt-0.5">{EXPORT_ICONS[format.id]}</span>
                    <span className="flex flex-col">
                      <span>{t(format.labelKey)}</span>
                      <span className="text-[11px] text-subtle-foreground">
                        {t(format.hintKey)}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={pdfLight}
                  onCheckedChange={(value) => onPdfLightChange(value === true)}
                  onSelect={(event) => event.preventDefault()}
                  className="text-[13px]"
                >
                  {t('header.pdfLight')}
                </DropdownMenuCheckboxItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenSettings}>
              <Settings />
              {t('header.settings')}
              <DropdownMenuShortcut>{mod}+,</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PaletteIcon />
                {t('header.appearance')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <DropdownMenuLabel>{t('header.mode')}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={themeMode}
                  onValueChange={(value) => onThemeModeChange(value as ThemeMode)}
                >
                  <DropdownMenuRadioItem value="light" onSelect={keepOpen}>
                    <Sun />
                    {t('header.themeLight')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" onSelect={keepOpen}>
                    <Moon />
                    {t('header.themeDark')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system" onSelect={keepOpen}>
                    <Monitor />
                    {t('header.themeSystem')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('header.palette')}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={palette}
                  onValueChange={(value) => onPaletteChange(value as Palette)}
                >
                  {PALETTES.map((item) => (
                    <DropdownMenuRadioItem key={item.id} value={item.id} onSelect={keepOpen}>
                      <PaletteSwatch swatch={item.swatch} />
                      {item.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('header.explorerSection')}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={explorerSide}
                  onValueChange={(value) => onExplorerSideChange(value as ExplorerSide)}
                >
                  <DropdownMenuRadioItem value="left">
                    <PanelLeft />
                    {t('header.left')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="right">
                    <PanelRight />
                    {t('header.right')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-1.5 flex items-center gap-0.5">
          <button
            type="button"
            className="inline-flex size-[30px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('window.minimize')}
            aria-label={t('window.minimize')}
            onClick={() => void backend.minimizeWindow()}
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            className="inline-flex size-[30px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={maximized ? t('window.restore') : t('window.maximize')}
            aria-label={maximized ? t('window.restore') : t('window.maximize')}
            onClick={() => void backend.toggleMaximizeWindow().then(setMaximized)}
          >
            {maximized ? <Copy className="size-3.5 -scale-x-100" /> : <Square className="size-3.5" />}
          </button>
          <button
            type="button"
            className="inline-flex size-[30px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
            title={t('window.close')}
            aria-label={t('window.close')}
            onClick={() => void backend.closeWindow()}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
