/**
 * Portable runtime bootstrap for USB / relocatable PingClaw installs.
 *
 * Must run before any module reads OpenClaw or PingClaw data paths.
 * Called from paths.ts (env bootstrap) and electron/main/bootstrap-portable.ts
 * (Electron userData redirect).
 */
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { getHostHomeDir } from './host-home';

const PORTABLE_MARKER = '.pingclaw-portable';
const PACKAGED_MARKER = join('resources', 'portable.marker');

export interface PortableRuntimeState {
  enabled: boolean;
  root: string;
  pingclawDataDir: string;
  openclawStateDir: string;
  openclawConfigPath: string;
}

let cached: PortableRuntimeState | null = null;

/** Test-only reset hook. */
export function resetPortableRuntimeForTests(): void {
  cached = null;
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function hasPortableMarker(dir: string): boolean {
  return existsSync(join(dir, PORTABLE_MARKER));
}

function detectPortableRoot(execPath: string, resourcesPath?: string): string | null {
  const explicitRoot = process.env.PINGCLAW_PORTABLE_ROOT?.trim();
  if (explicitRoot && (hasPortableMarker(explicitRoot) || isTruthyEnv(process.env.PINGCLAW_PORTABLE))) {
    return explicitRoot;
  }

  if (process.platform === 'darwin') {
    const macosDir = dirname(execPath);
    if (macosDir.endsWith('Contents/MacOS')) {
      const appBundle = dirname(dirname(macosDir));
      const portableRoot = dirname(appBundle);
      if (hasPortableMarker(portableRoot)) {
        return portableRoot;
      }
    }
  }

  const execDir = dirname(execPath);
  if (hasPortableMarker(execDir)) {
    return execDir;
  }

  if (resourcesPath && existsSync(join(resourcesPath, 'portable.marker'))) {
    if (explicitRoot) {
      return explicitRoot;
    }
    if (process.platform === 'darwin') {
      const macosDir = dirname(execPath);
      if (macosDir.endsWith('Contents/MacOS')) {
        const appBundle = dirname(dirname(macosDir));
        return dirname(appBundle);
      }
    }
    return dirname(execPath);
  }

  return null;
}

function shouldEnablePortableMode(root: string | null): boolean {
  if (root) {
    return true;
  }

  return (
    isTruthyEnv(process.env.PINGCLAW_PORTABLE)
    || Boolean(process.env.PINGCLAW_PORTABLE_ROOT?.trim())
    || (
      Boolean(process.env.CLAWX_USER_DATA_DIR?.trim())
      && Boolean(process.env.OPENCLAW_STATE_DIR?.trim())
    )
  );
}

export function bootstrapPortableRuntime(options: {
  execPath?: string;
  resourcesPath?: string;
} = {}): PortableRuntimeState {
  if (cached) {
    return cached;
  }

  const execPath = options.execPath ?? process.execPath;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const detectedRoot = detectPortableRoot(execPath, resourcesPath);
  const enabled = shouldEnablePortableMode(detectedRoot);

  if (!enabled) {
    cached = {
      enabled: false,
      root: '',
      pingclawDataDir: '',
      openclawStateDir: '',
      openclawConfigPath: '',
    };
    return cached;
  }

  const root = detectedRoot
    || process.env.PINGCLAW_PORTABLE_ROOT?.trim()
    || dirname(execPath);

  const pingclawDataDir = process.env.CLAWX_USER_DATA_DIR?.trim() || join(root, 'data', 'pingclaw');
  const openclawStateDir = process.env.OPENCLAW_STATE_DIR?.trim() || join(root, 'data', 'openclaw');
  const openclawConfigPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || join(openclawStateDir, 'openclaw.json');
  const portableHomeDir = join(root, 'data', 'home');

  mkdirSync(pingclawDataDir, { recursive: true });
  mkdirSync(openclawStateDir, { recursive: true });
  mkdirSync(portableHomeDir, { recursive: true });

  if (!process.env.PINGCLAW_HOST_HOME?.trim()) {
    try {
      process.env.PINGCLAW_HOST_HOME = getHostHomeDir();
    } catch {
      // uv-storage will retry when installing Python.
    }
  }

  process.env.PINGCLAW_PORTABLE = '1';
  process.env.PINGCLAW_PORTABLE_ROOT = root;
  process.env.CLAWX_USER_DATA_DIR = pingclawDataDir;
  process.env.OPENCLAW_STATE_DIR = openclawStateDir;
  process.env.OPENCLAW_CONFIG_PATH = openclawConfigPath;
  process.env.HOME = portableHomeDir;
  process.env.USERPROFILE = portableHomeDir;
  process.env.OPENCLAW_HOME = portableHomeDir;

  cached = {
    enabled: true,
    root,
    pingclawDataDir,
    openclawStateDir,
    openclawConfigPath,
  };
  return cached;
}

export function getPortableRuntime(): PortableRuntimeState | null {
  return cached?.enabled ? cached : null;
}

export function getPortableRuntimeInfo(): {
  enabled: boolean;
  root?: string;
  pingclawDataDir?: string;
  openclawStateDir?: string;
  openclawConfigPath?: string;
} {
  const runtime = getPortableRuntime();
  if (!runtime) {
    return { enabled: false };
  }
  return {
    enabled: true,
    root: runtime.root,
    pingclawDataDir: runtime.pingclawDataDir,
    openclawStateDir: runtime.openclawStateDir,
    openclawConfigPath: runtime.openclawConfigPath,
  };
}

export function isPortableMode(): boolean {
  if (cached?.enabled) {
    return true;
  }
  return isTruthyEnv(process.env.PINGCLAW_PORTABLE);
}

export function getPortableMarkerPath(): string {
  return PORTABLE_MARKER;
}

export function getPackagedPortableMarkerPath(): string {
  return PACKAGED_MARKER;
}
