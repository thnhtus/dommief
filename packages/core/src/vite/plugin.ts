import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, type ResolvedConfig } from '../config.js';
import { scanRoutes } from '../routes.js';
import { transformMarkdown } from '../markdown/index.js';

export function dommiefPlugin(opts: { root: string }) {
  let config: ResolvedConfig;
  let routes: ReturnType<typeof scanRoutes> = [];
  const plugin: Plugin = {
    name: 'dommief',
    enforce: 'pre',
    async configResolved() {
      config = await loadConfig(opts.root);
      routes = scanRoutes(config.root, config.srcDir, config.locales, config.forceKebabCase);
    },
    resolveId(id, importer) {
      if (id.startsWith('virtual:dommief/')) return '\0' + id;
      if (id.endsWith('.md')) {
        const base = importer ? path.dirname(importer) : process.cwd();
        const abs = path.isAbsolute(id) ? id : path.resolve(base, id);
        return '\0dommief-md:' + encodeURIComponent(abs);
      }
      return null;
    },
    async load(id) {
      if (id === '\0virtual:dommief/routes') {
        return `export default ${JSON.stringify(routes.map(r => ({ id: r.id, path: r.path })))};`;
      }
      if (id === '\0virtual:dommief/site') {
        return `export const site = ${JSON.stringify({ title: config.title, base: config.base })};`;
      }
      if (id.startsWith('\0dommief-md:')) {
        const file = decodeURIComponent(id.slice('\0dommief-md:'.length));
        const code = await fs.promises.readFile(file, 'utf8');
        const { code: out } = await transformMarkdown(code, file);
        return { code: out, map: null, moduleType: 'jsx' };
      }
      return null;
    },
  };
  return plugin;
}
