import { basename, dirname } from '../lib/paths';
import { LogoMarkdown, IconFolder, IconNew, IconTrash } from './Icons';

interface WelcomeProps {
  recents: string[];
  demoAvailable: boolean;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onNew: () => void;
  onOpenDemo: () => void;
  onClearRecents: () => void;
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
  return (
    <div className="welcome">
      <div className="welcome__box">
        <div className="welcome__logo">
          <LogoMarkdown />
          <h1 className="welcome__title">md-view</h1>
        </div>
        <p className="welcome__sub">
          Markdown con tablas, formulas LaTeX, diagramas Mermaid, SVG animados e imagenes, con
          vista previa igual a la de GitHub.
        </p>

        <div className="welcome__actions">
          <button type="button" className="btn btn--primary" onClick={onOpen}>
            <IconFolder />
            Abrir archivo
          </button>
          <button type="button" className="btn btn--outline" onClick={onNew}>
            <IconNew />
            Nuevo documento
          </button>
          {demoAvailable && (
            <button type="button" className="btn btn--outline" onClick={onOpenDemo}>
              Ver demo
            </button>
          )}
        </div>

        {recents.length > 0 && (
          <>
            <div className="welcome__section-title">
              <span>Recientes</span>
            </div>
            <div className="welcome__recents">
              {recents.map((path) => (
                <button
                  type="button"
                  key={path}
                  className="popover__item"
                  title={path}
                  onClick={() => onOpenRecent(path)}
                >
                  <strong>{basename(path)}</strong>
                  <span>{dirname(path)}</span>
                </button>
              ))}
              <button
                type="button"
                className="popover__item popover__item--muted"
                onClick={onClearRecents}
              >
                <strong>
                  <IconTrash /> Borrar lista
                </strong>
              </button>
            </div>
          </>
        )}

        <p className="welcome__hint">
          Podes arrastrar un archivo <code>.md</code> sobre la ventana para abrirlo.
          <br />
          <kbd>Ctrl</kbd> + <kbd>O</kbd> abrir · <kbd>Ctrl</kbd> + <kbd>S</kbd> guardar ·{' '}
          <kbd>Ctrl</kbd> + <kbd>1/2/3</kbd> cambiar de vista
        </p>
      </div>
    </div>
  );
}
