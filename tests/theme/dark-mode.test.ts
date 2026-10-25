import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Đặc tả: docs/spec/THEME-API.md §9.2 Amendment 2026-10-22 #1 + backlog DM-510.
// "JS tắt + prefersColor.default: 'dark' → HTML có data-prefers-color='dark'" — nghĩa là
// giá trị PHẢI tới từ SSR (<html>), không được chỉ phụ thuộc inline script chạy sau khi tải JS.
const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const site = path.join(repo, 'tests/fixtures/site');
const dist = path.join(site, 'dist');
const configPath = path.join(site, 'dommief.config.ts');
const originalConfig = fs.readFileSync(configPath, 'utf8');

describe('dark mode SSR (DM-510, THEME-API §9.2 Amendment #1)', () => {
  beforeAll(() => {
    fs.writeFileSync(configPath, "export default { title: 'Fixture', base: '/sub/', themeConfig: { prefersColor: { default: 'dark' } } };\n");
    execFileSync('pnpm', ['-C', 'packages/core', 'build'], { cwd: repo, stdio: 'pipe' });
    fs.rmSync(dist, { recursive: true, force: true });
    execFileSync('node', [path.join(repo, 'packages/core/dist/cli.js'), 'build'], { cwd: site, stdio: 'pipe' });
  }, 180_000);

  afterAll(() => {
    fs.writeFileSync(configPath, originalConfig);
  });

  it('(1) data-prefers-color="dark" nằm sẵn trong HTML tĩnh (không phụ thuộc JS)', () => {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    expect(html).toMatch(/<html[^>]*data-prefers-color="dark"/);
  });

  it('(2) inline script < 1KB, không async/defer', () => {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const m = html.match(/<script>(\(function[^]*?)<\/script>/);
    expect(m).not.toBeNull();
    const script = m![1]!;
    expect(script.length).toBeLessThan(1024);
    expect(html).not.toMatch(/<script[^>]*(async|defer)[^>]*>\(function/);
  });
});
