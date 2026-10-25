import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const source = path.join(repo, 'tests/fixtures/site');
const workRoot = path.join(repo, 'tests/fixtures/.work');

/**
 * Bản sao RIÊNG của fixture site cho một file test (nằm trong repo để vẫn resolve node_modules của repo).
 * Các file test chạy song song, nên không bao giờ dùng chung `dist/` hay `dommief.config.ts`.
 */
export function createSite(name: string, opts: { config?: string } = {}) {
  const dir = path.join(workRoot, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.cpSync(source, dir, { recursive: true, filter: (src) => !/[\\/](dist|\.dommief)$/.test(src) });
  if (opts.config !== undefined) fs.writeFileSync(path.join(dir, 'dommief.config.ts'), opts.config);
  const dist = path.join(dir, 'dist');
  return {
    dir,
    dist,
    read: (rel: string) => fs.readFileSync(path.join(dist, rel), 'utf8'),
    build: () => execFileSync('node', [path.join(repo, 'packages/core/dist/cli.js'), 'build'], { cwd: dir, stdio: 'pipe' }),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
