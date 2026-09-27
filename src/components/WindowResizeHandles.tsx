import * as backend from '@/lib/backend';
import type { WindowResizeDirection } from '@/lib/backend';
import { cn } from '@/lib/utils';

const HANDLES: Array<[suffix: string, direction: WindowResizeDirection, classes: string]> = [
  ['n', 'North', 'inset-x-2 top-0 h-[5px] cursor-ns-resize'],
  ['s', 'South', 'inset-x-2 bottom-0 h-[5px] cursor-ns-resize'],
  ['e', 'East', 'inset-y-2 right-0 w-[5px] cursor-ew-resize'],
  ['w', 'West', 'inset-y-2 left-0 w-[5px] cursor-ew-resize'],
  ['ne', 'NorthEast', 'top-0 right-0 size-2.5 cursor-nesw-resize'],
  ['nw', 'NorthWest', 'top-0 left-0 size-2.5 cursor-nwse-resize'],
  ['se', 'SouthEast', 'right-0 bottom-0 size-2.5 cursor-nwse-resize'],
  ['sw', 'SouthWest', 'left-0 bottom-0 size-2.5 cursor-nesw-resize'],
];

/**
 * La ventana no tiene marco nativo, asi que ofrecemos los bordes como zonas
 * invisibles de redimensionado (unos pocos pixeles sobre los extremos).
 */
export function WindowResizeHandles() {
  if (!backend.isTauri) return null;

  return (
    <>
      {HANDLES.map(([suffix, direction, classes]) => (
        <div
          key={suffix}
          className={cn('fixed z-[220]', classes)}
          onPointerDown={(event) => {
            event.preventDefault();
            void backend.startWindowResize(direction);
          }}
        />
      ))}
    </>
  );
}
