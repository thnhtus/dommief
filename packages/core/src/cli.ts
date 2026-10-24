import { cac } from 'cac';
import { createServer } from 'vite';
import { build } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dommiefPlugin } from './vite/plugin.js';
import { createLogger } from './log.js';
import { loadConfig } from './config.js';
import { createPluginHost } from './plugins.js';

const ENTRY_SERVER = fileURLToPath(new URL('./client/entry-server.tsx', import.meta.url));

const cli = cac('dommief');

cli.command('dev', 'start dev server')
  .option('--verbose', 'verbose logging')
  .action(async (opts: { verbose?: boolean }) => {
    const log = createLogger(!!opts.verbose);
    const root = process.cwd();
    log.debug('root=' + root);
    const server = await createServer({
      root,
      plugins: [dommiefPlugin({ root })],
      server: { port: 5173 },
    });
    await server.listen();
    server.printUrls();
  });

cli.command('build', 'build site')
  .option('--verbose', 'verbose logging')
  .action(async (opts: { verbose?: boolean }) => {
    const log = createLogger(!!opts.verbose);
    const root = process.cwd();
    log.debug('root=' + root);
    const config = await loadConfig(root);
    const pluginHost = createPluginHost(config.plugins ?? []);
    // (a) client build → dist/
    await build({ root, plugins: [dommiefPlugin({ root })], base: config.base, build: { outDir: 'dist' } });
    // (b) SSR build → .dommief/server.mjs
    const outDir = path.join(root, '.dommief');
    fs.mkdirSync(outDir, { recursive: true });
    await build({
      root,
      plugins: [dommiefPlugin({ root })],
      base: config.base,
      build: { outDir, ssr: ENTRY_SERVER, rollupOptions: { output: { entryFileNames: 'server.mjs', format: 'esm' } } },
    });
    // (c) SSG
    const serverMod: any = await import(path.join(outDir, 'server.mjs'));
    const routes = serverMod.routes ?? serverMod.default?.routes ?? [];
    const render = serverMod.render ?? serverMod.default?.render;
    // concurrency mapLimit
    const concurrency = (config as any).ssg?.concurrency ?? 4;
    const queue = [...routes];
    const runOne = async (r: any) => {
      const html = await render(r.path);
      const targetDir = r.path === '/' ? path.join(root, 'dist') : path.join(root, 'dist', r.path.replace(/^\//, ''));
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'index.html'), html);
    };
    // simple pool
    const workers: Promise<void>[] = [];
    let i = 0;
    const run = async () => {
      while (i < queue.length) {
        const idx = i++;
        await runOne(queue[idx]);
      }
    };
    for (let w = 0; w < Math.min(concurrency, queue.length); w++) workers.push(run());
    await Promise.all(workers);
    // 404.html
    try {
      const html404 = await render('/404');
      fs.writeFileSync(path.join(root, 'dist', '404.html'), html404);
    } catch {}
    await pluginHost.runBuildEnd({ config, outDir: path.join(root, 'dist'), routes });
    console.log('build done');
  });

cli.command('preview', 'preview built site')
  .option('--verbose', 'verbose logging')
  .action(async (opts: { verbose?: boolean }) => {
    const log = createLogger(!!opts.verbose);
    const root = process.cwd();
    const { preview } = await import('vite');
    const server = await preview({ root, build: { outDir: 'dist' } });
    server.printUrls();
  });

cli.help();
cli.parse();
