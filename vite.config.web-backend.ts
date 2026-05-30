import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

function getExtensionPackages(): Set<string> {
  try {
    const manifestPath = resolve(__dirname, 'pingclaw-extensions.json');
    if (!existsSync(manifestPath)) return new Set();
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const allIds: string[] = [
      ...(manifest.extensions?.main ?? []),
      ...(manifest.extensions?.renderer ?? []),
    ];
    const pkgs = new Set<string>();
    for (const id of allIds) {
      if (id.startsWith('builtin/')) continue;
      const parts = id.split('/');
      pkgs.add(parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
    }
    return pkgs;
  } catch {
    return new Set();
  }
}

const extensionPackages = getExtensionPackages();

function isMainProcessExternal(id: string): boolean {
  if (!id || id.startsWith('\0')) return false;
  if (id.startsWith('.') || id.startsWith('/') || /^[A-Za-z]:[\\/]/.test(id)) return false;
  if (id.startsWith('@/') || id.startsWith('@electron/')) return false;
  for (const pkg of extensionPackages) {
    if (id === pkg || id.startsWith(pkg + '/')) return false;
  }
  return true;
}

/** Browser-only dev mode (`pnpm dev:web`). */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'electron/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    outDir: 'dist-electron/main',
    emptyOutDir: true,
    rollupOptions: {
      external: isMainProcessExternal,
    },
  },
});
