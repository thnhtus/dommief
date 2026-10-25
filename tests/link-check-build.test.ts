import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { createSite } from './helpers/fixture-site.ts';

// Đặc tả: docs/backlog/DM-410.md "Tiêu chí chấp nhận" #2.
// `dommief build` thật trên fixture có 1 link chết -> exit code ≠ 0; `--no-link-check` -> exit 0.
const s = createSite('link-check-build');
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

describe('dommief build + link-check thật (DM-410 §2)', () => {
  afterAll(() => s.cleanup());

  it('link chết -> exit code != 0, message đúng file:line', () => {
    fs.writeFileSync(path.join(s.dir, 'docs', 'broken.md'), '# Broken\n\n[dead](/khong-ton-tai)\n');
    expect(() => s.build()).toThrow();
    try {
      s.build();
    } catch (e: any) {
      const output = String(e.stderr ?? e.stdout ?? e.message);
      expect(output).toMatch(/link_target_missing/);
      expect(output).toMatch(/broken\.md:3/);
    }
  }, 60_000);

  it('--no-link-check -> exit 0 dù vẫn còn link chết', () => {
    execFileSync('node', [path.join(repo, 'packages/core/dist/cli.js'), 'build', '--no-link-check'], { cwd: s.dir, stdio: 'pipe' });
    expect(fs.existsSync(path.join(s.dist, 'index.html'))).toBe(true);
  }, 60_000);
});
