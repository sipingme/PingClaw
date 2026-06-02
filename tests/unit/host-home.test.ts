import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

describe('host-home', () => {
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.resetModules();
    previousEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it('ignores portable HOME redirect', async () => {
    process.env.HOME = '/Volumes/USB/data/home';
    delete process.env.PINGCLAW_HOST_HOME;

    const { getHostHomeDir } = await import('@electron/utils/host-home');
    expect(getHostHomeDir()).toBe(userInfo().homedir);
    expect(getHostHomeDir()).not.toBe(process.env.HOME);
    expect(homedir()).toBe(process.env.HOME);
  });

  it('prefers PINGCLAW_HOST_HOME when set', async () => {
    process.env.PINGCLAW_HOST_HOME = '/real/host/home';
    process.env.HOME = '/Volumes/USB/data/home';

    const { getHostHomeDir } = await import('@electron/utils/host-home');
    expect(getHostHomeDir()).toBe('/real/host/home');
  });
});
