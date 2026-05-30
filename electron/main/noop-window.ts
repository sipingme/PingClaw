import type { BrowserWindow } from 'electron';

/**
 * Headless placeholder used in CLAWX_WEB_DEV mode so IPC handlers that expect
 * a BrowserWindow can register without opening a desktop window.
 */
export function createNoopBrowserWindow(): BrowserWindow {
  return {
    isDestroyed: () => false,
    isMinimized: () => false,
    isMaximized: () => false,
    minimize: () => {},
    maximize: () => {},
    unmaximize: () => {},
    close: () => {},
    restore: () => {},
    show: () => {},
    focus: () => {},
    webContents: {
      send: () => {},
    },
  } as unknown as BrowserWindow;
}
