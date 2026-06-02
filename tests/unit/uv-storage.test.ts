import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('uv-storage (portable)', () => {
  let tempRoot: string;
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.resetModules();
    previousEnv = { ...process.env };
    tempRoot = mkdtempSync(join(tmpdir(), 'pingclaw-uv-storage-'));
    writeFileSync(join(tempRoot, '.pingclaw-portable'), '1\n', 'utf-8');
    process.env.PINGCLAW_PORTABLE = '1';
    process.env.PINGCLAW_PORTABLE_ROOT = tempRoot;
    process.env.OPENCLAW_STATE_DIR = join(tempRoot, 'data', 'openclaw');
    process.env.HOME = join(tempRoot, 'data', 'home');
  });

  afterEach(() => {
    process.env = previousEnv;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it.runIf(process.platform === 'darwin')('stores uv python on host disk, not USB', async () => {
    const mod = await import('@electron/utils/uv-storage');
    const env = mod.getUvStorageEnv();

    expect(env.UV_PYTHON_INSTALL_DIR).toBeTruthy();
    expect(env.UV_PYTHON_INSTALL_DIR).toContain('Application Support');
    expect(env.UV_PYTHON_INSTALL_DIR).not.toContain(tempRoot);
    expect(env.UV_CACHE_DIR).toContain(userInfo().homedir);
  });

  it('returns empty env outside portable mode', async () => {
    delete process.env.PINGCLAW_PORTABLE;
    delete process.env.PINGCLAW_PORTABLE_ROOT;

    const mod = await import('@electron/utils/uv-storage');
    expect(mod.getUvStorageEnv()).toEqual({});
  });
});
