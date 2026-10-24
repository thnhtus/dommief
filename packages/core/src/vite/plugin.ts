import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, type ResolvedConfig } from '../config.js';
import { createPluginHost, type PluginHookHost } from '../plugins.js';
import { transformMarkdown } from '../markdown/index.js';
import { dommiefRoutesPlugin } from './routesPlugin.js';
import { dommiefSitePlugin } from './sitePlugin.js';
import { winPath } from '../utils/path.js';
import { fileURLToPath } from 'node:url';

// Plugin tổng hợp: giữ phần transform md + ?meta, và uỷ thác virtual:dommief/routes
// + virtual:dommief/site cho hai plugin riêng để invalidate độc lập (DM-206/209).
const ENTRY_CLIENT = fileURLToPath(new URL('../client/entry-client.tsx', import.meta.url));

export function dommiefPlugin(opts: { root: string }) {
  let config: ResolvedConfig;
  let host: PluginHookHost | undefined;
  // object proxy để routes/site plugin đọc config sau khi configResolved chạy.
  const cfgRef: any = {};
  const markdownPlugin: Plugin = {
    name: 'dommief:markdown',
    enforce: 'pre',
    async configResolved() {
      config = await loadConfig(opts.root);
      Object.assign(cfgRef, config);
      host = createPluginHost(config.plugins ?? []);
    },
    resolveId(id, importer) {
      if (id === 'virtual:dommief/entry') return '\0virtual:dommief/entry';
      if (id === 'virtual:dommief/routes' || id === 'virtual:dommief/site') return null;
      if (id.startsWith('virtual:dommief/')) return '\0' + id;
      if (id.endsWith('.md') || id.endsWith('.md?meta')) {
        const base = importer ? path.dirname(importer.replace(/\?meta$/, '')) : process.cwd();
        const q = id.endsWith('?meta') ? '?meta' : '';
        const clean = id.replace(/\?meta$/, '');
        // Id = absolute POSIX path (+ `?meta`), KHÔNG `\0`: nhờ vậy `ModuleNode.file` là file md
        // thật và Vite tự invalidate module trang khi file đổi (DM-209 ca (d)).
        return winPath(path.isAbsolute(clean) ? clean : path.resolve(base, clean)) + q;
      }
      return null;
    },
    async load(id) {
      if (id === '\0virtual:dommief/entry') {
        return { code: `import ${JSON.stringify(ENTRY_CLIENT)};`, map: null, moduleType: 'js' };
      }
      if (id.endsWith('.md') || id.endsWith('.md?meta')) {
        const isMeta = id.endsWith('?meta');
        const file = isMeta ? id.slice(0, -'?meta'.length) : id;
        const code = await fs.promises.readFile(file, 'utf8');
        const { code: out, meta } = await transformMarkdown(code, file, host ? { hooks: host } : {});
        if (isMeta) {
          // CONTRACTS §6: ?meta CHỈ trả frontmatter — không toc/texts.
          return { code: `export default ${JSON.stringify({ frontmatter: meta.frontmatter })};`, map: null, moduleType: 'js' };
        }
        return { code: out, map: null, moduleType: 'jsx' };
      }
      return null;
    },
    transformIndexHtml(html) {
      const title = (config as any)?.title ?? 'Dommief';
      let out = html;
      if (!/<title>/.test(out)) out = out.replace('<head>', `<head><title>${title}</title>`);
      const tags = host ? host.collectHtmlHeadTags() : [];
      if (tags.length) out = out.replace('</head>', tags.join('\n') + '</head>');
      if (!out.includes('virtual:dommief/entry')) {
        out = out.replace('</body>', `<script type="module" src="/virtual:dommief/entry"></script></body>`);
      }
      return out;
    },
  };
  const routesPlugin = dommiefRoutesPlugin({ cwd: opts.root, config: cfgRef as any });
  const sitePlugin = dommiefSitePlugin({ cwd: opts.root, config: cfgRef as any });
  return [markdownPlugin, routesPlugin, sitePlugin] as Plugin[];
}
