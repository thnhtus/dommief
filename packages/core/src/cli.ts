import { cac } from 'cac';
import { createServer, preview } from 'vite';
import { dommiefPlugin } from './vite/plugin.js';
import { createLogger } from './log.js';
import { loadConfig } from './config.js';
import { createPluginHost } from './plugins.js';
import { runBuild } from './build.js';

const cli = cac('dommief');

cli.command('dev', 'start dev server')
  .option('--verbose', 'verbose logging')
  .option('--base <base>', 'public base path (vd /docs/)')
  .option('--port <port>', 'dev server port')
  .action(async (opts: { verbose?: boolean; base?: string; port?: number | string }) => {
    const log = createLogger(!!opts.verbose);
    const root = process.cwd();
    log.debug('root=' + root);
    const config = await loadConfig(root, { base: opts.base });
    const host = createPluginHost(config.plugins ?? []);
    const server = await createServer({
      root,
      plugins: [dommiefPlugin({ root, config, host })],
      server: { port: Number(opts.port ?? config.dev.port) },
    });
    await server.listen();
    server.printUrls();
  });

cli.command('build', 'build site')
  .option('--verbose', 'verbose logging')
  .option('--base <base>', 'public base path (vd /docs/)')
  .option('--out-dir <dir>', 'output directory')
  .option('--no-cache', 'bỏ qua cache transform')
  .option('--no-link-check', 'không kiểm link nội bộ chết')
  .action(async (opts: { verbose?: boolean; base?: string; outDir?: string; cache?: boolean; linkCheck?: boolean }) => {
    const log = createLogger(!!opts.verbose);
    const root = process.cwd();
    log.debug('root=' + root);
    const config = await loadConfig(root, { base: opts.base, outDir: opts.outDir, cache: opts.cache, linkCheck: opts.linkCheck });
    const host = createPluginHost(config.plugins ?? []);
    await runBuild({ root, config, host, log });
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
