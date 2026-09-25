interface StatusBarProps {
  path: string | null;
  hasDoc: boolean;
  dirty: boolean;
  unsaved: boolean;
  cursor: { line: number; column: number };
  words: number;
  chars: number;
  message: { text: string; kind: 'info' | 'error' } | null;
}

const numberFormat = new Intl.NumberFormat('es');

export function StatusBar({
  path,
  hasDoc,
  dirty,
  unsaved,
  cursor,
  words,
  chars,
  message,
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      {message ? (
        <span className={`statusbar__path ${message.kind === 'error' ? 'statusbar__error' : ''}`}>
          {message.text}
        </span>
      ) : (
        <span className="statusbar__path" title={path ?? ''}>
          {path ?? 'Sin documento'}
        </span>
      )}

      {hasDoc && (
        <>
          <span className={`statusbar__item ${dirty ? 'statusbar__dirty' : 'statusbar__saved'}`}>
            {dirty ? 'Sin guardar' : unsaved ? 'Nuevo' : 'Guardado'}
          </span>
          <span className="statusbar__item">
            Ln {cursor.line}, Col {cursor.column}
          </span>
          <span className="statusbar__item">{numberFormat.format(words)} palabras</span>
          <span className="statusbar__item">{numberFormat.format(chars)} caracteres</span>
        </>
      )}
    </footer>
  );
}
