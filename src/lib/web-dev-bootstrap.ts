/**
 * Browser bootstrap for `pnpm dev:web`.
 * Installs a minimal Electron API shim and connects to the headless Host API backend.
 */
import { setCachedHostApiToken } from '@/lib/host-api';
import type { ElectronAPI, IpcRenderer } from '@/types/electron';

const HOST_API_PORT = Number(import.meta.env.VITE_HOST_API_PORT || 13210);
const HOST_API_BASE = `http://127.0.0.1:${HOST_API_PORT}`;

type HostApiFetchRequest = {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

async function proxyHostApiFetch(
  token: string,
  request: HostApiFetchRequest,
): Promise<{
  ok: boolean;
  data?: { status: number; ok: boolean; json?: unknown; text?: string };
  error?: { message: string };
}> {
  const path = request.path;
  const method = (request.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(request.headers || {}) };
  headers.Authorization = `Bearer ${token}`;

  let body: string | undefined;
  if (request.body !== undefined && request.body !== null) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(`${HOST_API_BASE}${path}`, { method, headers, body });
  const data: { status: number; ok: boolean; json?: unknown; text?: string } = {
    status: response.status,
    ok: response.ok,
  };

  if (response.status !== 204) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data.json = await response.json().catch(() => undefined);
    } else {
      data.text = await response.text().catch(() => '');
    }
  }

  return { ok: true, data };
}

function createWebDevIpcRenderer(token: string): IpcRenderer {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const ipc: IpcRenderer = {
    invoke: async (channel: string, ...args: unknown[]) => {
      if (channel === 'hostapi:token') {
        return token;
      }

      if (channel === 'hostapi:fetch') {
        return proxyHostApiFetch(token, args[0] as HostApiFetchRequest);
      }

      if (channel === 'update:version') {
        return '0.0.0-dev';
      }

      if (channel === 'update:status') {
        return { status: 'idle' };
      }

      if (channel === 'update:setAutoDownload') {
        return { success: true };
      }

      if (channel === 'app:version') {
        return '0.0.0-dev';
      }

      if (channel === 'app:name') {
        return 'PingClaw';
      }

      if (channel === 'app:platform') {
        return 'web';
      }

      throw new Error(`Invalid IPC channel: ${channel}`);
    },
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(callback);
      listeners.set(channel, set);
      return () => {
        set.delete(callback);
      };
    },
    once: (channel: string, callback: (...args: unknown[]) => void) => {
      const wrapper = (...payload: unknown[]) => {
        ipc.off(channel, wrapper);
        callback(...payload);
      };
      return ipc.on(channel, wrapper);
    },
    off: (channel: string, callback?: (...args: unknown[]) => void) => {
      if (!callback) {
        listeners.delete(channel);
        return;
      }
      listeners.get(channel)?.delete(callback);
    },
  };

  return ipc;
}

export function isWebDevRuntime(): boolean {
  return import.meta.env.VITE_WEB_DEV === '1';
}

export async function bootstrapWebDev(): Promise<void> {
  if (!isWebDevRuntime()) {
    return;
  }

  window.localStorage.setItem('pingclaw:allow-localhost-fallback', '1');
  window.localStorage.setItem('pingclaw:allow-sse-fallback', '1');

  const response = await fetch(`${HOST_API_BASE}/api/dev/session`);
  if (!response.ok) {
    throw new Error(
      `Failed to connect to PingClaw backend at ${HOST_API_BASE}. `
      + 'Start it with `pnpm dev:web` or run the headless backend first.',
    );
  }

  const session = await response.json() as { token?: string };
  if (!session.token) {
    throw new Error('Backend session response did not include an auth token.');
  }

  setCachedHostApiToken(session.token);

  window.electron = {
    ipcRenderer: createWebDevIpcRenderer(session.token),
    platform: 'darwin',
    isDev: true,
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    getPathForFile: (file: File) => file.name,
  } satisfies ElectronAPI;
}
