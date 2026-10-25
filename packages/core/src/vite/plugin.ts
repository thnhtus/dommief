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
import { computePipelineHash, computeRoutesHash, type TransformCache } from '../cache.js';
// Import từ prefers-color.js (KHÔNG phải theme-api.js): file này chạy trong tiến trình
// Node của CLI (build-time), không qua bundle SSR của Vite. Import trực tiếp theme-api.tsx
// (có JSX + hook 'react') từng nạp 'react' vào tiến trình CLI qua đường khác với bản mà
// server.mjs dùng để renderToPipeableStream → 2 dispatcher react khác nhau →
// `TypeError: dispatcher.getOwner is not a function` (đã bắt trực tiếp, không phải suy đoán).
import { PREFERS_COLOR_ATTR, PREFERS_COLOR_BOOT_SCRIPT, resolveConfiguredColor, type PrefersColorValue } from '../prefers-color.js';

export interface DommiefPluginOptions {
  root: string;
  /** Đã resolve sẵn (CLI): dùng lại, không đọc config lần nữa. */
  config?: ResolvedConfig;
  /** Plugin host dùng chung với CLI (để `onBuildEnd` chạy trên đúng host đã đăng ký hook). */
  host?: PluginHookHost;
  /** Chỉ `dommief build` truyền vào (DM-406); dev chạy trong bộ nhớ Vite nên không cache. */
  cache?: TransformCache;
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
        const transformOpts = { hooks: state.host(), byFile: state.getTable().byFile, base: state.config().base, code: state.config().markdown };
        let out: string; let meta: Awaited<ReturnType<typeof transformMarkdown>>['meta']; let warnings: string[]; let apiSrcFiles: string[] = [];
        if (opts.cache) {
          const host = state.host();
          const input = {
            md: code, file, base: transformOpts.base,
            routesHash: computeRoutesHash(transformOpts.byFile),
            pipelineHash: computePipelineHash({ code: transformOpts.code, plugins: [...host.collectRemarkPlugins(), ...host.collectRehypePlugins()] }),
          };
          // `<API src>` đọc file nguồn khác .md: nội dung phụ thuộc file đó, không nằm trong key => không cache trang này.
          const cacheable = !/<API[\s/>]/.test(code);
          const hit = await opts.cache.getOrCompute(file, input, async () => {
            const r = await transformMarkdown(code, file, transformOpts);
            return { code: r.code, meta: r.meta, warnings: r.warnings };
          }, cacheable);
          ({ code: out, meta, warnings } = hit);
        } else {
          const r = await transformMarkdown(code, file, transformOpts);
          ({ code: out, meta, warnings, apiSrcFiles } = r);
        }
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
      // THEME-API §9.2 + Amendment #1: inline script < 1KB, KHÔNG `async`/`defer`, chạy trước
      // paint để không nháy sáng rồi sang tối. Nếu `themeConfig.prefersColor.default` khác
      // 'auto', SSR ghi thẳng `data-prefers-color` vào `<html>` để trang đúng màu ngay cả khi
      // tắt JS (gate Phase 4) — inline script chỉ GHI ĐÈ khi localStorage có lựa chọn khác.
      const themeConfig = state.config().themeConfig as { prefersColor?: { default?: PrefersColorValue } } | undefined;
      const configuredColor = resolveConfiguredColor(themeConfig?.prefersColor?.default);
      if (configuredColor && !/data-prefers-color=/.test(out)) {
        out = out.replace(/<html(\s|>)/, `<html ${PREFERS_COLOR_ATTR}="${configuredColor}"$1`);
      }
      if (!out.includes(PREFERS_COLOR_BOOT_SCRIPT)) {
        out = out.replace('</head>', `<script>${PREFERS_COLOR_BOOT_SCRIPT}</script></head>`);
      }
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
