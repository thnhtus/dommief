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

/** DM-912: nếu có route với >=2 bản dịch (alternates dài >=2), xuất `xhtml:link` cho mỗi url. */
function alternateLinks(route: Route, locales: { id: string }[], base: string, hostname: string): string {
  const alts = route.alternates;
  if (!alts || Object.keys(alts).length < 2) return '';
  const links = locales
    .filter((l) => alts[l.id])
    .map((l) => `<xhtml:link rel="alternate" hreflang="${escapeXml(l.id)}" href="${escapeXml(canonicalUrl(hostname, base, alts[l.id]!))}"/>`);
  const def = locales[0];
  if (def && alts[def.id]) links.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(canonicalUrl(hostname, base, alts[def.id]!))}"/>`);
  return links.join('');
}

/** `#404`, route động (`:`/`*`), và route trong `sitemap.exclude` không vào sitemap. */
export function buildSitemap(routes: Route[], config: SitemapConfig, base: string, locales: { id: string }[] = []): string {
  const emitXhtml = routes.some((r) => r.alternates && Object.keys(r.alternates).length >= 2);
  const xmlns = emitXhtml ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '';
  const urls = routes
    .filter((r) => r.path !== '/404' && !/[:*]/.test(r.path) && !matchExclude(r.path, config.exclude))
    .map((r) => `  <url><loc>${escapeXml(canonicalUrl(config.hostname, base, r.path))}</loc>${alternateLinks(r, locales, base, config.hostname)}</url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlns}>\n${urls}\n</urlset>\n`;
}

export function buildRobots(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** emitter nối vào `build.ts`: ghi `sitemap.xml`/`robots.txt` khi config có `sitemap` (khác `false`). */
export function writeSitemapAndRobots(opts: {
  outDir: string;
  routes: Route[];
  sitemap: false | SitemapConfig;
  robots: boolean;
  base: string;
  locales: { id: string }[];
  log: { warn(msg: string): void };
}): void {
  if (opts.sitemap === false) return;
  if (!opts.sitemap.hostname) {
    opts.log.warn('sitemap.hostname thiếu — bỏ qua sitemap.xml/robots.txt');
    return;
  }
  const xml = buildSitemap(opts.routes, opts.sitemap, opts.base, opts.locales);
  fs.writeFileSync(path.join(opts.outDir, 'sitemap.xml'), xml);
  if (opts.robots) {
    const sitemapUrl = canonicalUrl(opts.sitemap.hostname, opts.base, '/').replace(/\/$/, '') + '/sitemap.xml';
    fs.writeFileSync(path.join(opts.outDir, 'robots.txt'), buildRobots(sitemapUrl));
  }
}
