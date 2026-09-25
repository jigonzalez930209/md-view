import { useEffect, useRef, useState, type ReactNode } from 'react';
import { basename, dirname } from '../lib/paths';
import type { Theme } from '../lib/theme';
import {
  IconChevronDown,
  IconEdit,
  IconEye,
  IconFolder,
  IconMoon,
  IconNew,
  IconSave,
  IconSaveAs,
  IconSplit,
  IconSun,
  IconTrash,
} from './Icons';

export type ViewMode = 'edit' | 'split' | 'preview';

interface ToolbarProps {
  docName: string | null;
  docPath: string | null;
  dirty: boolean;
  mode: ViewMode;
  theme: Theme;
  recents: string[];
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onModeChange: (mode: ViewMode) => void;
  onToggleTheme: () => void;
  onClearRecents: () => void;
}

function ViewButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn${active ? ' is-active' : ''}`}
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  docName,
  docPath,
  dirty,
  mode,
  theme,
  recents,
  onOpen,
  onOpenRecent,
  onNew,
  onSave,
  onSaveAs,
  onModeChange,
  onToggleTheme,
  onClearRecents,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';

  return (
    <header className="toolbar">
      <div className="popover-host" ref={menuRef}>
        <div className="split-button">
          <button
            type="button"
            className="btn btn--outline"
            title={`Abrir archivo (${mod}+O)`}
            onClick={onOpen}
          >
            <IconFolder />
            <span className="btn__label">Abrir</span>
          </button>
          <button
            type="button"
            className="btn btn--outline btn--caret"
            aria-label="Archivos recientes"
            aria-expanded={menuOpen}
            title="Archivos recientes"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <IconChevronDown />
          </button>
        </div>

        {menuOpen && (
          <div className="popover" role="menu">
            {recents.length === 0 ? (
              <p className="popover__empty">Todavia no abriste ningun archivo.</p>
            ) : (
              <>
                {recents.map((path) => (
                  <button
                    type="button"
                    key={path}
                    className="popover__item"
                    title={path}
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenRecent(path);
                    }}
                  >
                    <strong>{basename(path)}</strong>
                    <span>{dirname(path)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="popover__item popover__item--muted"
                  onClick={() => {
                    setMenuOpen(false);
                    onClearRecents();
                  }}
                >
                  <strong>
                    <IconTrash /> Borrar recientes
                  </strong>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <button type="button" className="btn" title={`Nuevo documento (${mod}+N)`} onClick={onNew}>
        <IconNew />
        <span className="btn__label">Nuevo</span>
      </button>

      <div className="toolbar__divider" />

      <button
        type="button"
        className="btn"
        title={`Guardar (${mod}+S)`}
        onClick={onSave}
        disabled={!docName}
      >
        <IconSave />
        <span className="btn__label">Guardar</span>
      </button>
      <button
        type="button"
        className="btn"
        title={`Guardar como (${mod}+Shift+S)`}
        onClick={onSaveAs}
        disabled={!docName}
      >
        <IconSaveAs />
        <span className="btn__label">Guardar como</span>
      </button>

      <div className="toolbar__spacer" />

      {docName && (
        <div className="doctitle" title={docPath ?? docName}>
          {dirty && <span className="doctitle__dot" aria-label="Cambios sin guardar" />}
          <span className="doctitle__name">{docName}</span>
          {docPath && <span className="doctitle__dir">{dirname(docPath)}</span>}
        </div>
      )}

      <div className="toolbar__spacer" />

      <div className="segmented" role="group" aria-label="Modo de vista" hidden={!docName}>
        <ViewButton active={mode === 'edit'} title={`Solo editor (${mod}+1)`} onClick={() => onModeChange('edit')}>
          <IconEdit />
        </ViewButton>
        <ViewButton
          active={mode === 'split'}
          title={`Editor y vista previa (${mod}+2)`}
          onClick={() => onModeChange('split')}
        >
          <IconSplit />
        </ViewButton>
        <ViewButton
          active={mode === 'preview'}
          title={`Solo lectura (${mod}+3)`}
          onClick={() => onModeChange('preview')}
        >
          <IconEye />
        </ViewButton>
      </div>

      <button
        type="button"
        className="btn btn--ghost"
        title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
    </header>
  );
}
