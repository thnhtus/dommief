import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSite } from './helpers/fixture-site.ts';

// Đặc tả: docs/backlog/DM-406.md "Tiêu chí chấp nhận" #2-4.
const s = createSite('cache-build');
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cliJs = path.join(repo, 'packages/core/dist/cli.js');

function buildVerbose(): string {
  return execFileSync('node', [cliJs, 'build', '--verbose'], { cwd: s.dir, stdio: 'pipe', encoding: 'utf8' });
}

describe('cache tích hợp qua dommief build thật (DM-406 §2-4)', () => {
  afterAll(() => s.cleanup());

  it('(2) build 2 lần: lần 2 cache hit = số trang, lần 2 nhanh hơn lần 1', () => {
    const t0 = Date.now();
    const out1 = buildVerbose();
    const t1 = Date.now();
    expect(out1).toMatch(/cache 0\/\d+ hit/);
    const out2 = buildVerbose();
    const t2 = Date.now();
    const m = out2.match(/cache (\d+)\/(\d+) hit/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(m![2]); // hit === tổng số trang
    expect(t2 - t1).toBeLessThan(t1 - t0);
  }, 60_000);

  it('(3) sửa 1 file rồi build lại: hit = n-1, miss = 1, missReasons chứa md-changed cho đúng file', () => {
    const file = path.join(s.dir, 'docs', 'guide', 'getStarted.md');
    const content = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, content + '\n<!-- đổi nội dung -->\n');
    const out = buildVerbose();
    const m = out.match(/cache (\d+)\/(\d+) hit/);
    expect(m).not.toBeNull();
    expect(Number(m![2]) - Number(m![1])).toBe(1);
    expect(out).toMatch(/miss.*getStarted\.md.*md-changed/);
  }, 60_000);

  it('(4) xoá 1 file md: cache của file đó bị gc xoá sau build', () => {
    const cacheDir = path.join(s.dir, '.dommief', 'cache');
    const manifestBefore = JSON.parse(fs.readFileSync(path.join(cacheDir, 'manifest.json'), 'utf8'));
    const key = manifestBefore[Object.keys(manifestBefore).find((f) => f.includes('getStarted.md'))!]?.key;
    expect(key).toBeTruthy();
    const cacheFile = path.join(cacheDir, key.slice(0, 2), `${key}.json`);
    expect(fs.existsSync(cacheFile)).toBe(true);

    fs.rmSync(path.join(s.dir, 'docs', 'guide', 'getStarted.md'));
    // Xóa cả link trỏ tới file vừa xóa: link-check (DM-410) đúng ý phải fail build nếu không,
    // và đây không phải điều ca test này muốn kiểm (gc cache, không phải link-check).
    const indexFile = path.join(s.dir, 'docs', 'index.md');
    fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace(/ See \[get started\]\(\.\/guide\/getStarted\.md\)\./, ''));
    s.build();
    expect(fs.existsSync(cacheFile)).toBe(false);
  }, 60_000);
});
