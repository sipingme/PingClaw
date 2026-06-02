/**
 * uv / Python storage paths for portable mode.
 *
 * Managed Python installs use symlinks. exFAT USB drives cannot support them,
 * so portable mode stores uv caches on the host internal disk (per USB volume id).
 * OpenClaw agents/skills/config remain on the USB drive.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getHostHomeDir } from './host-home';
import { isPortableMode } from './portable-runtime';
import { logger } from './logger';

function portableStorageKey(): string {
  const root = process.env.PINGCLAW_PORTABLE_ROOT?.trim() || 'unknown';
  return createHash('sha256').update(root).digest('hex').slice(0, 16);
}

export function getHostPortableUvRoot(): string | null {
  if (!isPortableMode()) {
    return null;
  }

  const key = portableStorageKey();
  const realHome = getHostHomeDir();

  if (process.platform === 'darwin') {
    return join(realHome, 'Library', 'Application Support', 'PingClaw', 'portable-uv', key);
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA?.trim() || join(realHome, 'AppData', 'Local');
    return join(localAppData, 'PingClaw', 'portable-uv', key);
  }

  return join(realHome, '.local', 'share', 'pingclaw', 'portable-uv', key);
}

/**
 * Env vars that redirect uv away from portable HOME on USB (symlink-safe host paths).
 */
export function getUvStorageEnv(): Record<string, string> {
  const root = getHostPortableUvRoot();
  if (!root) {
    return {};
  }

  const pythonDir = join(root, 'python');
  const cacheDir = join(root, 'cache');
  const dataDir = join(root, 'data');

  for (const dir of [root, pythonDir, cacheDir, dataDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  logger.info(`Portable uv storage on host disk: ${root}`);

  return {
    UV_PYTHON_INSTALL_DIR: pythonDir,
    UV_CACHE_DIR: cacheDir,
    XDG_DATA_HOME: dataDir,
    XDG_CACHE_HOME: cacheDir,
  };
}
