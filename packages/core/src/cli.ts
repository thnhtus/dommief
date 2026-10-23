import { cac } from 'cac';
import { createServer } from 'vite';
import { build } from 'vite';
import path from 'node:path';
import { dommiefPlugin } from './vite/plugin.js';

const cli = cac('dommief');

cli.command('dev', 'start dev server').action(async () => {
  const root = process.cwd();
  const server = await createServer({
    root,
    plugins: [dommiefPlugin({ root })],
    server: { port: 5173 },
  });
  await server.listen();
  server.printUrls();
});

cli.command('build', 'build site').action(async () => {
  const root = process.cwd();
  // client build
  await build({ root, plugins: [dommiefPlugin({ root })], build: { outDir: 'dist' } });
  console.log('build done');
});

cli.help();
cli.parse();
