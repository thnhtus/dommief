import path from 'node:path';
import { cac } from 'cac';
import { createServer } from 'vite';
import { dommiefPlugin } from './vite/plugin.js';
import { createLogger } from './log.js';
import { loadConfig } from './config.js';
import { createPluginHost } from './plugins.js';
import { runBuild, LinkCheckFailedError } from './build.js';
import { startPreview } from './preview.js';
import { DommiefError, formatError } from './markdown/errors.js';

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
    try {
      await runBuild({ root, config, host, log });
    } catch (e) {
      if (e instanceof LinkCheckFailedError) {
        log.error('link nội bộ chết:\n' + e.report);
        process.exitCode = 1;
        return;
      }
      throw e;
    }
  });

cli.command('preview', 'preview built site')
  .option('--base <base>', 'public base path (vd /docs/)')
  .option('--out-dir <dir>', 'output directory')
  .option('--port <port>', 'preview server port')
  .option('--host [host]', 'expose ra network')
  .option('--open', 'mở trình duyệt')
  .action(async (opts: { base?: string; outDir?: string; port?: number | string; host?: string | boolean; open?: boolean }) => {
    const root = process.cwd();
    const config = await loadConfig(root, { base: opts.base, outDir: opts.outDir });
    try {
      const server = await startPreview({
        root,
        base: config.base,
        outDir: path.resolve(root, config.outDir),
        ...(opts.port !== undefined ? { port: Number(opts.port) } : {}),
        ...(opts.host !== undefined ? { host: opts.host } : {}),
        ...(opts.open !== undefined ? { open: opts.open } : {}),
      });
      server.printUrls();
    } catch (e) {
      if (e instanceof DommiefError) {
        console.error('[error] ' + formatError(e));
        process.exitCode = 1;
        return;
      }
      throw e;
    }
  });

cli.help();
cli.parse();
