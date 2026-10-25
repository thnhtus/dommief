import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Đặc tả: docs/backlog/DM-511.md. Override MỘT slot bằng cách chỉ tạo
// `.dommief/theme/slots/Footer/index.tsx` trong fixture -> build thật phải dùng file đó,
// không fork cả theme (mọi slot khác vẫn là default).
const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const site = path.join(repo, 'tests/fixtures/site');
const dist = path.join(site, 'dist');
const overrideDir = path.join(site, '.dommief', 'theme', 'slots', 'Footer');

describe('override Footer qua .dommief/theme (DM-511)', () => {
  beforeAll(() => {
    fs.mkdirSync(overrideDir, { recursive: true });
    fs.writeFileSync(
      path.join(overrideDir, 'index.tsx'),
      "export function Footer() { return 'OVERRIDE-FOOTER-MARKER'; }\n",
    );
    execFileSync('pnpm', ['-C', 'packages/core', 'build'], { cwd: repo, stdio: 'pipe' });
    fs.rmSync(dist, { recursive: true, force: true });
    execFileSync('node', [path.join(repo, 'packages/core/dist/cli.js'), 'build'], { cwd: site, stdio: 'pipe' });
  }, 180_000);

  afterAll(() => {
    fs.rmSync(path.join(site, '.dommief', 'theme'), { recursive: true, force: true });
  });

  it('(1) override marker xuất hiện, default marker không', () => {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    expect(html).toContain('OVERRIDE-FOOTER-MARKER');
    expect(html).not.toContain('>Dommief<');
  });

  it('không fork cả theme: Navbar/Sidebar vẫn render (default)', () => {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain('aria-label="Sidebar"');
  });
});
