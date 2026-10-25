import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, type ResolvedConfig } from '../config.js';
import { createPluginHost, type PluginHookHost } from '../plugins.js';
import { transformMarkdown } from '../markdown/index.js';
import { resolveClientFile, resolveThemeApiFile } from '../paths.js';
import { dommiefRoutesPlugin } from './routesPlugin.js';
import { dommiefSitePlugin } from './sitePlugin.js';
import { createState } from './state.js';
import { winPath } from '../utils/path.js';
import { buildAliasChain } from '../theme/resolver.js';

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
      const aliases = buildAliasChain(opts.root, loaded.config);
      // `package.json` export `./theme-api` trỏ `dist/theme-api.js`; theme (vd theme-default) import
      // `dommief/theme-api` phải trúng file NGUỒN mà entry-client/entry-server import (resolveClientFile
      // luôn chọn source), nếu không sẽ ra 2 module khác nhau → `SiteContext` khác nhau →
      // `useSiteData()`/`useNavData()` trong theme luôn rỗng (xem paths.ts).
      aliases['dommief/theme-api'] = resolveThemeApiFile();
      return {
        base: loaded.config.base,
        resolve: { dedupe: ['react', 'react-dom', 'react-router'], alias: aliases },
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
          // ?meta: import công khai cho code người dùng (vd `import m from './x.md?meta'`).
          // KHÔNG còn ai trong core dùng đường này để dựng site module — xem `extractPageSummary` (#12).
          // Trả frontmatter + toc (nhỏ) — không texts (nặng, chỉ để tìm kiếm).
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
    configureServer(server) {
      // DM-502: thêm/xoá file trong `.dommief/theme/**` phải đăng ký lại alias KHÔNG restart server.
      // Alias cũ đã bị các module khác import tĩnh ⇒ không cách nào HMR theo chuẩn, phải full-reload.
      const localThemeDir = winPath(path.resolve(opts.root, '.dommief', 'theme')) + '/';
      const update = () => {
        const aliases = buildAliasChain(opts.root, loaded!.config);
        server.config.resolve.alias = { ...(server.config.resolve.alias as any), ...aliases };
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', (f) => { if (winPath(f).startsWith(localThemeDir)) update(); });
      server.watcher.on('unlink', (f) => { if (winPath(f).startsWith(localThemeDir)) update(); });
    },
  };
  return [markdownPlugin, dommiefRoutesPlugin(state), dommiefSitePlugin(state)] as Plugin[];
}
