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
import { TransformCache, type CacheStats } from './cache.js';
import { matchExclude } from './exclude.js';
import { writeSitemapAndRobots, canonicalUrl } from './sitemap.js';
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

/** DM-409 lát mỏng: `runBuild` trả số thay vì chỉ ghi log, để test đọc trực tiếp (không parse
 * stdout). `cacheStats` là `TransformCache.stats` hiện có (DM-406) — không đổi shape, chỉ lộ ra. */
export interface BuildResult {
  timings: Record<string, number>;
  cacheStats: CacheStats;
}

export class LinkCheckFailedError extends Error {
  constructor(public readonly report: string) {
    super('link nội bộ chết; chạy với --no-link-check để bỏ qua');
  }
}

/** Ngữ cảnh cho các bước phát file bổ sung (sitemap, robots, search index...).
 * `routes` CHỈ chứa route đã PRERENDER thật (`plan.prerender`) — KHÔNG phải toàn bộ cây route
 * từ SSR bundle. Route bị `ssg.exclude`/`ssg.noEmit` không có nội dung thật, nên không được
 * vào sitemap/search index — đã bắt trực tiếp: emitter trước đây nhận `routes` toàn bộ nên
 * `ssg.exclude` không được sitemap tôn trọng trừ khi cấu hình `sitemap.exclude` trùng (REVIEW). */
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

// DM-708: sitemap/robots phát sau khi SSG ghi HTML (dùng danh sách routes đã prerender).
emitters.push({
  name: 'sitemap',
  run: ({ config, outDir, routes, log }) => {
    writeSitemapAndRobots({ outDir, routes, sitemap: config.sitemap, robots: config.robots, base: config.base, log });
  },
});

export interface StageTiming { stage: string; ms: number }

/**
 * Lát mỏng DM-409 (xem docs/backlog/DM-409.md): thêm cột `%` + luôn in (không cần `--verbose`).
 * CHƯA đạt: 9 khâu riêng (config/scan/parse/highlight tách khỏi build:client) — ở kiến trúc
 * hiện tại `parse`/`highlight` chạy LỒNG trong `build:client`/`build:ssr` (qua
 * `dommiefPlugin.load()`, không phải một lời gọi `vite.build` riêng) nên tách đúng đòi thu thập
 * thời gian qua callback xuyên plugin (kiểu `collectTexts` ở DM-801), không phải thêm một
 * `timed()` mới — để lại cho phần 2 của DM-409 khi có quyết định tối ưu cần số đó.
 * Các khâu liệt kê ở đây KHÔNG rời nhau tuyệt đối (`search-index`/sitemap nằm SAU
 * `build:client`/`build:ssr`, không nằm trong) nên `%` cộng xấp xỉ 100% nhưng không chính xác
 * tuyệt đối nếu sau này có emitter đan xen — đủ đúng để thấy khâu nào đáng đụng trước.
 */
export function formatTimings(timings: StageTiming[]): string {
  const total = timings.reduce((s, t) => s + t.ms, 0);
  const w = Math.max(...timings.map((t) => t.stage.length), 5);
  const pct = (ms: number) => (total > 0 ? `${Math.round((ms / total) * 100)}%` : '—').padStart(4);
  const sec = (ms: number) => ((ms / 1000).toFixed(2) + 's').padStart(8);
  const rows = timings.map((t) => `  ${t.stage.padEnd(w)}  ${sec(t.ms)}  ${pct(t.ms)}`);
  return ['build timings:', ...rows, `  ${'total'.padEnd(w)}  ${sec(total)}  ${pct(total)}`].join('\n');
}

/**
 * Quyết định route nào được prerender / chỉ phát shell / bỏ qua (REVIEW §1 #17):
 * - `exclude`: KHÔNG prerender nhưng VẪN ghi shell (index.html chưa có nội dung) để host không SPA-fallback không 404.
 * - `noEmit`: không ghi file nào.
 */
export function planRoutes(routes: Route[], ssg: { exclude: string[]; noEmit: string[] }, log?: Logger): { prerender: Route[]; shell: Route[] } {
  const prerender: Route[] = [];
  const shell: Route[] = [];
  for (const r of routes) {
    if (matchesAny(r.path, ssg.noEmit)) continue;
    if (matchesAny(r.path, ssg.exclude)) {
      shell.push(r);
      // DM-411: exclude một route KHÔNG PHẢI lá (có route con) nghĩa là điều hướng thẳng vào
      // URL đó trên static host sẽ 404 (host không phục vụ shell cho prefix). Cảnh báo,
      // không fail — người dùng có quyền tự biết host của mình có SPA fallback hay không.
      if (log && routes.some((other) => other !== r && other.path.startsWith(r.path === '/' ? '/' : r.path + '/'))) {
        log.warn(`ssg.exclude đang loại route "${r.path}" NHƯNG nó có route con — điều hướng thẳng vào "${r.path}" trên host không SPA fallback sẽ 404`);
      }
      continue;
    }
    prerender.push(r);
  }
  return { prerender, shell };
}

/**
 * Khớp route path với pattern glob (`*` một segment, `**` nhiều segment — exclude.ts). Thêm một
 * quy ước cũ đã có test: `/a/*` khớp cả chính `/a` (loại cả trang mục lục lẫn trang con).
 */
export function matchesAny(p: string, patterns: string[]): boolean {
  return patterns.some((pat) => (pat.endsWith('/*') && p === pat.slice(0, -2)) || matchExclude(p, [pat]));
}

function routesByPath(routes: Route[]): Record<string, { path: string }> {
  return Object.fromEntries(routes.map((r) => [r.path, { path: r.path }]));
}

export async function runBuild({ root, config, host, log }: BuildOptions): Promise<BuildResult> {
  // `config.linkCheck` đã gộp `--no-link-check` qua `loadConfig` (config.ts); không cần tham số riêng ở đây.
  const linkCheckEnabled = config.linkCheck !== false;
  const timings: StageTiming[] = [];
  const timed = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    try { return await fn(); } finally { timings.push({ stage, ms: performance.now() - t0 }); }
  };
  // DM-406: cache nằm ở `.dommief/cache` (KHÔNG nằm trong `.dommief/server`, vì thư mục đó bị emptyOutDir mỗi build).
  const cache = new TransformCache(path.join(root, '.dommief', 'cache'), config.cache);
  // DM-801: thu `texts` mỗi file .md ngay trong lượt transform của build client (đủ 1 lần cho
  // cả build — build ssr dùng chung `dommiefPlugin` nên transform lại trang đã cache sẽ không
  // gọi lại `load()`, chỉ cần gắn collector ở MỖI lần `plugins()` để cả 2 lượt đều ghi được vo cùng Map).
  const textsByFile = new Map<string, import('./markdown/index.js').TextFragment[]>();
  const plugins = () => [dommiefPlugin({ root, config, host, cache, collectTexts: (file, texts) => textsByFile.set(file, texts) })];
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
  const site: { routes?: Record<string, { file: string }>; meta?: Record<string, { toc?: TocItem[]; frontmatter?: Record<string, unknown> }> } | undefined = serverMod.site ?? serverMod.default?.site;
  const fileOf = (routeId: string): string => site?.routes?.[routeId]?.file ?? routeId;
  const canonicalHostname: string | undefined = config.sitemap === false ? undefined : config.sitemap.hostname;
  const escapeAttr = (s: string) => s.replace(/"/g, '&quot;');
  const wrap = (html: string, routePath: string) => {
    let out = template.replace(ROOT_PLACEHOLDER, () => `<div id="root">${html}</div>`);
    if (canonicalHostname && routePath !== '/404') {
      const href = canonicalUrl(canonicalHostname, config.base, routePath);
      if (!/<link[^>]+rel=["']canonical["']/i.test(out)) {
        out = out.replace(/<\/head>/i, `  <link rel="canonical" href="${escapeAttr(href)}">\n</head>`);
      }
    }
    return out;
  };
  const plan = planRoutes(routes, config.ssg, log);
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
      writePage(r, wrap(html, r.path));
    });
    for (const r of plan.shell) writePage(r, wrap(template, r.path));
    // 404.html: route "*" của cùng cây <Routes>
    try {
      fs.writeFileSync(path.join(distDir, '404.html'), wrap(await render('/404'), '/404'));
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

  if (config.search.enabled) {
    await timed('search-index', async () => {
      const { buildSearchIndex, INDEX_BUDGET_BYTES_PER_PAGE } = await import('./search.js');
      const res = await buildSearchIndex({
        routes: plan.prerender,
        loadPageMeta: (r) => ({
          frontmatter: site?.meta?.[r.id]?.frontmatter ?? {},
          toc: site?.meta?.[r.id]?.toc ?? [],
          texts: textsByFile.get(fileOf(r.id)) ?? [],
        }),
        config: { locales: config.locales },
      });
      const searchDir = path.join(distDir, 'search-index');
      fs.mkdirSync(searchDir, { recursive: true });
      for (const [localeId, json] of Object.entries(res.locales)) {
        fs.writeFileSync(path.join(searchDir, `${localeId}.json`), JSON.stringify(json));
      }
      for (const [localeId, s] of Object.entries(res.stats)) {
        const kbPerPage = s.pages ? (s.bytes / 1024 / s.pages).toFixed(1) : '0';
        log.info(`search index [${localeId}]: ${s.docs} docs, ${(s.bytes / 1024).toFixed(1)} KB, ${kbPerPage} KB/trang`);
        // DM-805: chỉ cảnh báo, KHÔNG fail build ở v0.1 (tiêu chí #3 — siết lại là việc của DM-1102).
        if (s.bytes > INDEX_BUDGET_BYTES_PER_PAGE * s.pages) {
          log.warn(`search index [${localeId}] vượt ngân sách ${(INDEX_BUDGET_BYTES_PER_PAGE / 1024).toFixed(0)} KB/trang (đang ở ${kbPerPage} KB/trang)`);
        }
      }
    });
  }

  for (const e of emitters) await timed(e.name, async () => { await e.run({ root, config, outDir: distDir, routes: plan.prerender, log }); });
  await timed('plugins', () => host.runBuildEnd({ config, outDir: distDir, routes }));

  cache.finish();
  if (config.cache) {
    log.info(cache.summary());
    if (log.verbose) for (const [f, why] of Object.entries(cache.stats.missReasons)) log.info(`  miss ${path.relative(root, f)} (${why})`);
  }
  // DM-409 lát mỏng: bảng timing LUÔN in (tiêu chí spec — không cần `--verbose`; trước đây chỉ
  // in khi verbose, mâu thuẫn trực tiếp với "bảng ~10 dòng, giá trị cao hơn phiền toái").
  log.info(formatTimings(timings));
  log.info('build done');
  return {
    timings: Object.fromEntries(timings.map((t) => [t.stage, t.ms])),
    cacheStats: cache.stats,
  };
}
