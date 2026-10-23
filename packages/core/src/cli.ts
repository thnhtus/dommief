import { cac } from 'cac';
import { createServer } from 'vite';
import { build } from 'vite';
import path from 'node:path';
import { dommiefPlugin } from './vite/plugin.js';
import { createLogger } from './log.js';

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
    await build({ root, plugins: [dommiefPlugin({ root })], build: { outDir: 'dist' } });
    console.log('build done');
  });

cli.help();
cli.parse();
