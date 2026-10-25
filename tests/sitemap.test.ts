import { describe, it, expect, vi } from 'vitest';
import { buildSitemap, buildRobots, writeSitemapAndRobots } from '../packages/core/src/sitemap.ts';
import { createSite } from './helpers/fixture-site.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('sitemap (DM-708)', () => {
  it('(a) URL có base + host', () => {
    const routes: any[] = [{ path: '/' }, { path: '/guide/get-started' }];
    const xml = buildSitemap(routes, { hostname: 'https://example.com', exclude: [] }, '/sub/');
    expect(xml).toContain('<loc>https://example.com/sub/</loc>');
    expect(xml).toContain('<loc>https://example.com/sub/guide/get-started</loc>');
  });

  it('(b) excluded route không xuất hiện', () => {
    const routes: any[] = [{ path: '/' }, { path: '/draft-foo' }, { path: '/guide/get-started' }];
    const xml = buildSitemap(routes, { hostname: 'https://example.com', exclude: ['/draft-foo'] }, '/');
    expect(xml).not.toContain('/draft-foo');
  });

  it('(c) robots.txt chứa Sitemap:', () => {
    expect(buildRobots('https://example.com/sitemap.xml')).toMatch(/Sitemap: https:\/\/example\.com\/sitemap\.xml/);
  });

  it('(d) sitemap false → không ghi gì; hostname thiếu/cấu hình không hợp lệ → cảnh báo, không crash', () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-smap-'));
    const log = { warn: vi.fn() };
    writeSitemapAndRobots({ outDir: dir, routes: [{ path: '/' } as any], sitemap: false, robots: true, base: '/', log });
    expect(fs.existsSync(path.join(dir, 'sitemap.xml'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'robots.txt'))).toBe(false);
    // hostname trống -> cảnh báo, không ghi
    writeSitemapAndRobots({ outDir: dir, routes: [{ path: '/' } as any], sitemap: { hostname: '', exclude: [] } as any, robots: true, base: '/', log });
    expect(log.warn).toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'sitemap.xml'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('sitemap build integration (DM-708)', () => {
  it('build fixture → tồn tại dist/sitemap.xml, dist/robots.txt', () => {
    const s = createSite('sitemap-build');
    fs.writeFileSync(s.dir + '/dommief.config.ts', "export default { title: 'Fixture', sitemap: { hostname: 'https://example.com' } };\n");
    s.build();
    expect(fs.existsSync(path.join(s.dist, 'sitemap.xml'))).toBe(true);
    expect(fs.existsSync(path.join(s.dist, 'robots.txt'))).toBe(true);
    const xml = fs.readFileSync(path.join(s.dist, 'sitemap.xml'), 'utf8');
    expect(xml).toContain('https://example.com/');
    // /404 không xuất hiện
    expect(xml).not.toContain('/404');
    s.cleanup();
  });

  it('route bị ssg.exclude không xuất hiện trong sitemap', () => {
    const s = createSite('sitemap-exclude');
    fs.writeFileSync(s.dir + '/dommief.config.ts', "export default { title: 'Fixture', sitemap: { hostname: 'https://example.com', exclude: ['/guide/get-started'] }, ssg: { exclude: ['/guide/get-started'] } };\n");
    s.build();
    const xml = fs.readFileSync(path.join(s.dist, 'sitemap.xml'), 'utf8');
    expect(xml).not.toContain('/guide/get-started');
    s.cleanup();
  });
});
