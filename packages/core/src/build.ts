import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { dommiefPlugin } from './vite/plugin.js';
import { resolveClientFile } from './paths.js';
import { formatError, DommiefError } from './markdown/errors.js';
import type { ResolvedConfig } from './config.js';
import type { PluginHookHost } from './plugins.js';
import type { Logger } from './log.js';
import type { Route } from './types.js';
import { collect, check, formatIssues } from './link-check.js';
import type { TocItem } from './markdown/index.js';

const ROOT_PLACEHOLDER = /<div id="root"><\/div>/;

/** Chạy `fn` cho từng phần tử, tối đa `limit` việc cùng lúc. */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export interface BuildOptions {
  root: string;
  config: ResolvedConfig;
  host: PluginHookHost;
  log: Logger;
}

export class LinkCheckFailedError extends Error {
  constructor(public readonly report: string) {
    super('link nội bộ chết; chạy với --no-link-check để bỏ qua');
  }
}

/** Ngữ cảnh cho các bước phát file bổ sung (sitemap, robots, search index...). */
export interface EmitContext {
  root: string;
  config: ResolvedConfig;
  outDir: string;
  routes: Route[];
  log: Logger;
}

/** Bước phát thêm file vào `outDir` sau SSG. Thêm tính năng = thêm một emitter, không sửa `runBuild`. */
export type Emitter = { name: string; run: (ctx: EmitContext) => void | Promise<void> };

/** Danh sách emitter mặc định; lane sitemap/search đăng ký vào đây. */
export const emitters: Emitter[] = [];

export interface StageTiming { stage: string; ms: number }

export function formatTimings(timings: StageTiming[]): string {
  const total = timings.reduce((s, t) => s + t.ms, 0);
  const w = Math.max(...timings.map((t) => t.stage.length), 5);
  const rows = timings.map((t) => `  ${t.stage.padEnd(w)}  ${String(Math.round(t.ms)).padStart(6)} ms`);
  return ['build timings:', ...rows, `  ${'total'.padEnd(w)}  ${String(Math.round(total)).padStart(6)} ms`].join('\n');
}

/**
 * Quyết định route nào được prerender / chỉ phát shell / bỏ qua (REVIEW §1 #17):
 * - `exclude`: KHÔNG prerender nhưng VẪN ghi shell (index.html chưa có nội dung) để host không SPA-fallback không 404.
 * - `noEmit`: không ghi file nào.
 */
export function planRoutes(routes: Route[], ssg: { exclude: string[]; noEmit: string[] }): { prerender: Route[]; shell: Route[] } {
  const prerender: Route[] = [];
  const shell: Route[] = [];
  for (const r of routes) {
    if (matchesAny(r.path, ssg.noEmit)) continue;
    (matchesAny(r.path, ssg.exclude) ? shell : prerender).push(r);
  }
  return { prerender, shell };
}

/** Khớp path với pattern: đúng chuỗi, hoặc prefix kết thúc bằng `/*`. */
export function matchesAny(p: string, patterns: string[]): boolean {
  return patterns.some((pat) => (pat.endsWith('/*') ? p === pat.slice(0, -2) || p.startsWith(pat.slice(0, -1)) : p === pat));
}

function routesByPath(routes: Route[]): Record<string, { path: string }> {
  return Object.fromEntries(routes.map((r) => [r.path, { path: r.path }]));
}

export async function runBuild({ root, config, host, log }: BuildOptions): Promise<void> {
  // `config.linkCheck` đã gộp `--no-link-check` qua `loadConfig` (config.ts); không cần tham số riêng ở đây.
  const linkCheckEnabled = config.linkCheck !== false;
  const timings: StageTiming[] = [];
  const timed = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    try { return await fn(); } finally { timings.push({ stage, ms: performance.now() - t0 }); }
  };
  const plugins = () => [dommiefPlugin({ root, config, host })];
  const distDir = path.resolve(root, config.outDir);

  // (a) client build → outDir/
  await timed('client', () => build({ root, plugins: plugins(), base: config.base, build: { outDir: distDir, emptyOutDir: true } }));

  // (b) SSR build → .dommief/server/server.mjs.
  // KHÔNG dùng `.dommief` thẳng làm outDir: `emptyOutDir: true` xóa SẠCH thư mục đó trước
  // mỗi build, mà `.dommief/theme/**` (override của user, DM-502) và `.dommief/cache/**`
  // (DM-406) cũng sống trong `.dommief`. Xóa cả hai là mất dữ liệu người dùng mỗi lần build.
  const ssrDir = path.join(root, '.dommief', 'server');
  fs.mkdirSync(ssrDir, { recursive: true });
  await timed('ssr', () => build({
    root,
    plugins: plugins(),
    base: config.base,
    build: {
      outDir: ssrDir,
      emptyOutDir: true,
      ssr: resolveClientFile('entry-server.tsx'),
      rollupOptions: { output: { entryFileNames: 'server.mjs', format: 'esm' } },
    },
  }));

  // (c) SSG: chèn markup vào index.html của Vite (script + css) thay vì ghi markup trần.
  // Phải đọc template TRƯỚC vòng lặp: route "/" ghi đè đúng file này.
  const templatePath = path.join(distDir, 'index.html');
  const template = fs.readFileSync(templatePath, 'utf8');
  if (!ROOT_PLACEHOLDER.test(template)) {
    throw new DommiefError('index.html không có <div id="root"></div> để chèn nội dung prerender', { file: templatePath, code: 'ssg_no_root' });
  }
  const serverMod: any = await import(pathToFileURL(path.join(ssrDir, 'server.mjs')).href);
  // CHÚ Ý: đây là `RouteModule[]` (routesModule.ts: {id, path, component, preload}), KHÔNG phải
  // `Route[]` đầy đủ (không có `file`) — đặt tên `routes` theo code cũ, nhưng đừng đọc
  // `r.file` trên nó (luôn `undefined`, đã bắt trực tiếp lúc test link-check thật). File thật
  // nằm ở `site.routes[r.id].file` (sinh bởi siteModule.ts, đầy đủ kiểu `Route`).
  const routes: Route[] = serverMod.routes ?? serverMod.default?.routes ?? [];
  const render: (url: string) => Promise<string> = serverMod.render ?? serverMod.default?.render;
  const site: { routes?: Record<string, { file: string }>; meta?: Record<string, { toc?: TocItem[] }> } | undefined = serverMod.site ?? serverMod.default?.site;
  const fileOf = (routeId: string): string => site?.routes?.[routeId]?.file ?? routeId;
  const wrap = (html: string) => template.replace(ROOT_PLACEHOLDER, () => `<div id="root">${html}</div>`);
  const plan = planRoutes(routes, config.ssg);
  const writePage = (r: Route, html: string) => {
    const targetDir = r.path === '/' ? distDir : path.join(distDir, r.path.replace(/^\//, ''));
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), html);
  };
  const linkRefs: ReturnType<typeof collect> = [];
  await timed('prerender', async () => {
    await mapLimit(plan.prerender, config.ssg.concurrency, async (r) => {
      const html = await render(r.path);
      if (linkCheckEnabled) linkRefs.push(...collect(r.id, html, fileOf(r.id)));
      writePage(r, wrap(html));
    });
    for (const r of plan.shell) writePage(r, template);
    // 404.html: route "*" của cùng cây <Routes>
    try {
      fs.writeFileSync(path.join(distDir, '404.html'), wrap(await render('/404')));
    } catch (e) {
      log.warn('không render được 404.html: ' + formatError(e));
    }
  });

  if (linkCheckEnabled) {
    await timed('link-check', async () => {
      // route bị `ssg.exclude` không có trong site.meta (prerender bỏ qua) → không khóa anchor check nhầm lỗi (DM-410 ca h).
      const tocByRoute: Record<string, TocItem[]> = {};
      for (const r of plan.prerender) {
        const meta = site?.meta?.[r.id];
        if (meta?.toc) tocByRoute[r.path] = meta.toc;
      }
      const issues = check(linkRefs, { byPath: routesByPath(routes), tocByRoute, base: config.base, outDir: distDir });
      if (issues.length) throw new LinkCheckFailedError(formatIssues(issues));
    });
  }

  for (const e of emitters) await timed(e.name, async () => { await e.run({ root, config, outDir: distDir, routes, log }); });
  await timed('plugins', () => host.runBuildEnd({ config, outDir: distDir, routes }));

  if (log.verbose) log.info(formatTimings(timings));
  log.info('build done');
}
