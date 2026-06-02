import { userInfo } from 'node:os';
import { join } from 'node:path';

/**
 * Real OS user home directory.
 *
 * Portable launchers set HOME / USERPROFILE to `<usb>/data/home` so OpenClaw
 * config stays on the drive. Node's os.homedir() follows HOME, so callers
 * that need the internal disk must use this helper instead.
 */
export function getHostHomeDir(): string {
  const pinned = process.env.PINGCLAW_HOST_HOME?.trim();
  if (pinned) {
    return pinned;
  }

  try {
    const fromPasswd = userInfo().homedir;
    if (fromPasswd) {
      return fromPasswd;
    }
  } catch {
    // Fall through to platform defaults.
  }

  if (process.platform === 'darwin') {
    const user = process.env.USER?.trim() || process.env.LOGNAME?.trim();
    if (user) {
      return join('/Users', user);
    }
  }

  if (process.platform === 'win32') {
    const homeDrive = process.env.HOMEDRIVE?.trim();
    const homePath = process.env.HOMEPATH?.trim();
    if (homeDrive && homePath) {
      return `${homeDrive}${homePath}`;
    }
  }

  throw new Error('Unable to resolve host home directory');
}
