import fs from 'node:fs';
import path from 'node:path';
import type { Route } from './types.js';
import { matchExclude } from './exclude.js';

// Đặc tả: docs/backlog/DM-708.md, docs/spec/CONFIG.md §1.5. URL tuyệt đối theo `base` + hostname
// cấu hình (KHÔNG đoán domain — thiếu hostname thì không phát gì, không crash). Chỉ route tĩnh
// đã prerender (routes truyền vào phải là `plan.prerender`, không phải mọi route).

export interface SitemapConfig {
  hostname: string;
  exclude: string[];
}

export function canonicalUrl(hostname: string, base: string, routePath: string): string {
  const host = hostname.replace(/\/$/, '');
  const b = base.replace(/\/$/, '');
  const p = routePath === '/' ? '/' : routePath;
  return host + (b + p).replace(/\/{2,}/g, '/').replace(/^(https?:\/)([^/])/, '$1/$2');
}

/** `#404`, route động (`:`/`*`), và route trong `sitemap.exclude` không vào sitemap. */
export function buildSitemap(routes: Route[], config: SitemapConfig, base: string): string {
  const urls = routes
    .filter((r) => r.path !== '/404' && !/[:*]/.test(r.path) && !matchExclude(r.path, config.exclude))
    .map((r) => `  <url><loc>${escapeXml(canonicalUrl(config.hostname, base, r.path))}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobots(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** emitter nối vào `build.ts`: ghi `sitemap.xml`/`robots.txt` khi config có `sitemap` (khác `false`). */
export function writeSitemapAndRobots(opts: {
  outDir: string;
  routes: Route[];
  sitemap: false | SitemapConfig;
  robots: boolean;
  base: string;
  log: { warn(msg: string): void };
}): void {
  if (opts.sitemap === false) return;
  if (!opts.sitemap.hostname) {
    opts.log.warn('sitemap.hostname thiếu — bỏ qua sitemap.xml/robots.txt');
    return;
  }
  const xml = buildSitemap(opts.routes, opts.sitemap, opts.base);
  fs.writeFileSync(path.join(opts.outDir, 'sitemap.xml'), xml);
  if (opts.robots) {
    const sitemapUrl = canonicalUrl(opts.sitemap.hostname, opts.base, '/').replace(/\/$/, '') + '/sitemap.xml';
    fs.writeFileSync(path.join(opts.outDir, 'robots.txt'), buildRobots(sitemapUrl));
  }
}
