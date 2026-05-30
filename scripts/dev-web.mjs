#!/usr/bin/env zx
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function spawnProcess(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: (() => {
      const env = { ...process.env, CLAWX_WEB_DEV: '1' };
      delete env.ELECTRON_RUN_AS_NODE;
      return env;
    })(),
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[dev:web] ${label} exited (${signal})`);
      return;
    }
    if (code && code !== 0) {
      console.error(`[dev:web] ${label} exited with code ${code}`);
    }
  });
  return child;
}

await $`node scripts/generate-ext-bridge.mjs`;
await $`zx scripts/prepare-preinstalled-skills-dev.mjs`;
await $`vite build --config vite.config.web-backend.ts`;

const backend = spawnProcess('pnpm', ['exec', 'electron', '.'], 'backend');
const frontend = spawnProcess('pnpm', ['exec', 'vite', '--config', 'vite.config.web.ts'], 'frontend');

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  backend.kill(signal);
  frontend.kill(signal);
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await Promise.race([
  new Promise((resolve) => backend.on('exit', resolve)),
  new Promise((resolve) => frontend.on('exit', resolve)),
]);

shutdown('SIGTERM');
