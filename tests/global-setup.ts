import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Build core MỘT lần cho cả phiên vitest. Trước đây mỗi test e2e tự chạy `tsup` (clean: true) song song,
// xoá `dist/cli.js` đúng lúc test khác đang chạy nó → ENOENT ngẫu nhiên.
export default function setup(): void {
  const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  execFileSync('pnpm', ['-C', 'packages/core', 'build'], { cwd: repo, stdio: 'pipe' });
}
