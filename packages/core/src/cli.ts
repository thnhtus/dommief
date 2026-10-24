import { cac } from 'cac';
import { build, createServer, preview } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dommiefPlugin } from './vite/plugin.js';
import { createLogger } from './log.js';
import { loadConfig } from './config.js';
import { createPluginHost } from './plugins.js';
import { resolveClientFile } from './paths.js';
import { formatError, DommiefError } from './markdown/errors.js';
import type { Route } from './types.js';

const ROOT_PLACEHOLDER = /<div id="root"><\/div>/;

/** Chạy `fn` cho từng phần tử, tối đa `limit` việc cùng lúc. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const cli = cac('dommief');

cli.command('dev', 'start dev server')
  .option('--verbose', 'verbose logging')
  .option('--base <base>', 'public base path (vd /docs/)')
  .action(async (opts: { verbose?: boolean; base?: string }) => {
    const log = createLogger(!!opts.verbose);
    const root = process.cwd();
    log.debug('root=' + root);
    const config = await loadConfig(root, { base: opts.base });
    const host = createPluginHost(config.plugins ?? []);
    const server = await createServer({
      root,
      plugins: [dommiefPlugin({ root, config, host })],
      server: { port: 5173 },
    });
    await server.listen();
    server.printUrls();
  });

cli.command('build', 'build site')
  .option('--verbose', 'verbose logging')
  .option('--base <base>', 'public base path (vd /docs/)')
  .option('--out-dir <dir>', 'output directory')
  .action(async (opts: { verbose?: boolean; base?: string; outDir?: string }) => {
    const log = createLogger(!!opts.verbose);
    const root = process.cwd();
    log.debug('root=' + root);
    const config = await loadConfig(root, { base: opts.base, outDir: opts.outDir });
    const host = createPluginHost(config.plugins ?? []);
    const plugins = () => [dommiefPlugin({ root, config, host })];
    const distDir = path.resolve(root, config.outDir);
    // (a) client build → outDir/
    await build({ root, plugins: plugins(), base: config.base, build: { outDir: distDir, emptyOutDir: true } });
    // (b) SSR build → .dommief/server.mjs
    const ssrDir = path.join(root, '.dommief');
    fs.mkdirSync(ssrDir, { recursive: true });
    await build({
      root,
      plugins: plugins(),
      base: config.base,
      build: {
        outDir: ssrDir,
        emptyOutDir: true,
        ssr: resolveClientFile('entry-server.tsx'),
        rollupOptions: { output: { entryFileNames: 'server.mjs', format: 'esm' } },
      },
    });
    // (c) SSG: chèn markup vào index.html của Vite (script + css) thay vì ghi markup trần.
    // Phải đọc template TRƯỚC vòng lặp: route "/" ghi đè đúng file này.
    const templatePath = path.join(distDir, 'index.html');
    const template = fs.readFileSync(templatePath, 'utf8');
    if (!ROOT_PLACEHOLDER.test(template)) {
      throw new DommiefError('index.html không có <div id="root"></div> để chèn nội dung prerender', { file: templatePath, code: 'ssg_no_root' });
    }
    const serverMod: any = await import(pathToFileURL(path.join(ssrDir, 'server.mjs')).href);
    const routes: Route[] = serverMod.routes ?? serverMod.default?.routes ?? [];
    const render: (url: string) => Promise<string> = serverMod.render ?? serverMod.default?.render;
    const wrap = (html: string) => template.replace(ROOT_PLACEHOLDER, () => `<div id="root">${html}</div>`);
    await mapLimit(routes, config.ssg.concurrency, async (r) => {
      const html = wrap(await render(r.path));
      const targetDir = r.path === '/' ? distDir : path.join(distDir, r.path.replace(/^\//, ''));
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'index.html'), html);
    });
    // 404.html: route "*" của cùng cây <Routes>
    try {
      fs.writeFileSync(path.join(distDir, '404.html'), wrap(await render('/404')));
    } catch (e) {
      log.warn('không render được 404.html: ' + formatError(e));
    }
    await host.runBuildEnd({ config, outDir: distDir, routes });
    log.info('build done');
  });

cli.command('preview', 'preview built site')
  .option('--base <base>', 'public base path (vd /docs/)')
  .option('--out-dir <dir>', 'output directory')
  .action(async (opts: { base?: string; outDir?: string }) => {
    const root = process.cwd();
    const config = await loadConfig(root, { base: opts.base, outDir: opts.outDir });
    const server = await preview({ root, base: config.base, build: { outDir: config.outDir } });
    server.printUrls();
  });

cli.help();
cli.parse();
