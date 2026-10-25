import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// DM-802 tiêu chí #2: bundle worker THẬT không được kéo theo react/react-dom (và không Node-only
// như Buffer/node:*) — chỉ bắt được bằng cách bundle thật, không bắt được bằng test logic.
const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '../packages/core/src/client/search-worker.ts');
// `vite` là dependency của packages/core, KHÔNG phải của root: resolve từ package đó thay vì thêm
// vào root (đổi lockfile từng làm pnpm sinh 2 instance react-router, vỡ cả bộ hydrate test).
const coreRequire = createRequire(path.resolve(here, '../packages/core/package.json'));
const loadVite = async () => (await import(pathToFileURL(coreRequire.resolve('vite')).href)) as typeof import('vite');

describe('search worker bundle (DM-802)', () => {
  it('không chứa react/react-dom/react-router, Buffer, hay import node:*', async () => {
    const { build } = await loadVite();
    const out: any = await build({
      configFile: false,
      logLevel: 'silent',
      build: { write: false, lib: { entry, formats: ['es'], fileName: 'w' }, minify: false },
    });
    const chunks = (Array.isArray(out) ? out : [out]).flatMap((o: any) => o.output) as Array<{ type: string; code?: string }>;
    const code = chunks.filter((c) => c.type === 'chunk').map((c) => c.code).join('\n');
    expect(code.length).toBeGreaterThan(1000); // minisearch có thật trong bundle
    expect(code).toMatch(/MiniSearch/);
    expect(code).not.toMatch(/react-dom|react-router|from ['"]react['"]|require\(['"]react['"]\)/);
    expect(code).not.toMatch(/\bBuffer\b/);
    expect(code).not.toMatch(/from ['"]node:/);
  }, 60_000);
});
