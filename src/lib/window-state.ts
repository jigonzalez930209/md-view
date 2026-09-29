/**
 * Window geometry persistence.
 *
 * The size, position and maximized state live in `localStorage` and are
 * restored on launch; a saved position outside every monitor is ignored so a
 * window never comes back off-screen. Only meaningful inside Tauri: in the
 * browser these calls do nothing.
 */

import {
  availableMonitors,
  getCurrentWindow,
  PhysicalPosition,
  PhysicalSize,
} from '@tauri-apps/api/window';
import { isTauri } from './backend';

export interface WindowGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
}

const KEY = 'md-view:window';

function readGeometry(): WindowGeometry | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WindowGeometry>;
    if (
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number' ||
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number'
    ) {
      return null;
    }
    return {
      width: parsed.width,
      height: parsed.height,
      x: parsed.x,
      y: parsed.y,
      maximized: parsed.maximized === true,
    };
  } catch {
    return null;
  }
}

function writeGeometry(geometry: WindowGeometry): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(geometry));
  } catch {
    /* private mode: we continue without persisting */
  }
}

/** Smallest visible fragment of the window for a saved position to be accepted. */
const VISIBLE_MARGIN_X = 80;
const VISIBLE_MARGIN_Y = 40;

/** Restores the geometry saved on the last run. */
export async function restoreWindowGeometry(): Promise<void> {
  if (!isTauri) return;
  const geometry = readGeometry();
  if (!geometry) return;
  try {
    const win = getCurrentWindow();
    const monitors = await availableMonitors();
    const visible = monitors.some((monitor) => {
      return (
        geometry.x < monitor.position.x + monitor.size.width - VISIBLE_MARGIN_X &&
        geometry.x + geometry.width > monitor.position.x + VISIBLE_MARGIN_X &&
        geometry.y < monitor.position.y + monitor.size.height - VISIBLE_MARGIN_Y &&
        geometry.y + geometry.height > monitor.position.y + VISIBLE_MARGIN_Y
      );
    });

    await win.setSize(
      new PhysicalSize(Math.max(640, Math.round(geometry.width)), Math.max(420, Math.round(geometry.height))),
    );
    if (visible) {
      await win.setPosition(
        new PhysicalPosition(Math.round(geometry.x), Math.round(geometry.y)),
      );
    }
    if (geometry.maximized) await win.maximize();
  } catch {
    /* keep the default geometry */
  }
}

/** Saves the geometry when the window moves, resizes or maximizes. */
export async function trackWindowGeometry(): Promise<() => void> {
  if (!isTauri) return () => {};
  const win = getCurrentWindow();
  let timer: number | null = null;

  const save = async () => {
    try {
      const maximized = await win.isMaximized();
      const size = await win.innerSize();
      const position = await win.outerPosition();
      writeGeometry({
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        maximized,
      });
    } catch {
      /* geometry is a convenience: never fail the app for it */
    }
  };

  const schedule = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void save();
    }, 500);
  };

  const unlisteners = await Promise.all([win.onResized(schedule), win.onMoved(schedule)]);
  return () => {
    unlisteners.forEach((unlisten) => unlisten());
    if (timer !== null) window.clearTimeout(timer);
  };
}
