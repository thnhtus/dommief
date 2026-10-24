import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, type ResolvedConfig } from '../config.js';
import { createPluginHost, type PluginHookHost } from '../plugins.js';
import { transformMarkdown } from '../markdown/index.js';
import { resolveClientFile } from '../paths.js';
import { dommiefRoutesPlugin } from './routesPlugin.js';
import { dommiefSitePlugin } from './sitePlugin.js';
import { createState } from './state.js';
import { winPath } from '../utils/path.js';

export interface DommiefPluginOptions {
  root: string;
  /** Đã resolve sẵn (CLI): dùng lại, không đọc config lần nữa. */
  config?: ResolvedConfig;
  /** Plugin host dùng chung với CLI (để `onBuildEnd` chạy trên đúng host đã đăng ký hook). */
  host?: PluginHookHost;
}

// Plugin tổng hợp: transform md + ?meta + entry ảo, và uỷ thác virtual:dommief/routes
// + virtual:dommief/site cho hai plugin riêng để invalidate độc lập (DM-206/209).
export function dommiefPlugin(opts: DommiefPluginOptions) {
  let loaded: { config: ResolvedConfig; host: PluginHookHost } | undefined =
    opts.config ? { config: opts.config, host: opts.host ?? createPluginHost(opts.config.plugins ?? []) } : undefined;
  const state = createState(opts.root, () => {
    if (!loaded) throw new Error('dommief: config chưa được nạp');
    return loaded;
  });

  const markdownPlugin: Plugin = {
    name: 'dommief:markdown',
    enforce: 'pre',
    async config() {
      if (!loaded) {
        const config = await loadConfig(opts.root);
        loaded = { config, host: createPluginHost(config.plugins ?? []) };
      }
      return {
        base: loaded.config.base,
        // một bản react/router duy nhất giữa trang md (nằm trong dự án) và client/ của dommief
        resolve: { dedupe: ['react', 'react-dom', 'react-router'] },
        // client/*.tsx của dommief là source TS: SSR phải bundle nó, không được externalize.
        ssr: { noExternal: ['dommief'] },
      };
    },
    resolveId(id, importer) {
      if (id === 'dommief/client') return resolveClientFile('index.tsx');
      const bare = id.replace(/^\//, '');
      if (bare === 'virtual:dommief/entry') return '\0virtual:dommief/entry';
      if (bare === 'virtual:dommief/routes' || bare === 'virtual:dommief/site') return null;
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
        return { code: `import ${JSON.stringify(resolveClientFile('entry-client.tsx'))};`, map: null, moduleType: 'js' };
      }
      if (id.endsWith('.md') || id.endsWith('.md?meta')) {
        const isMeta = id.endsWith('?meta');
        const file = isMeta ? id.slice(0, -'?meta'.length) : id;
        const code = await fs.promises.readFile(file, 'utf8');
        const { code: out, meta, warnings, apiSrcFiles } = await transformMarkdown(code, file, { hooks: state.host(), byFile: state.getTable().byFile, base: state.config().base });
        for (const w of warnings) this.warn(w);
        for (const apiFile of apiSrcFiles) this.addWatchFile(apiFile); // <API src> đọc file khác .md (#17)
        if (isMeta) {
          // ?meta trả frontmatter + toc (nhỏ; theme cần cho mục lục) — không texts (nặng, chỉ để tìm kiếm).
          return { code: `export default ${JSON.stringify({ frontmatter: meta.frontmatter, toc: meta.toc })};`, map: null, moduleType: 'js' };
        }
        return { code: out, map: null, moduleType: 'jsx' };
      }
      return null;
    },
    // order 'pre': script chèn ở đây phải đi qua bước bundle HTML của Vite, nếu không build không có JS.
    transformIndexHtml: { order: 'pre', handler(html) {
      const title = state.config().title;
      let out = html;
      if (!/<title>/.test(out)) out = out.replace('<head>', `<head><title>${title}</title>`);
      const tags = state.host().collectHtmlHeadTags();
      if (tags.length) out = out.replace('</head>', tags.join('\n') + '</head>');
      if (!out.includes('virtual:dommief/entry')) {
        out = out.replace('</body>', `<script type="module" src="/virtual:dommief/entry"></script></body>`);
      }
      return out;
    } },
  };
  return [markdownPlugin, dommiefRoutesPlugin(state), dommiefSitePlugin(state)] as Plugin[];
}
