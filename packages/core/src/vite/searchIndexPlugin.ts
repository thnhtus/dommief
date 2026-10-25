import type { Plugin } from 'vite';
import fs from 'node:fs';
import type { DommiefState } from './state.js';

// DM-801: `virtual:dommief/search-index` trả CHỈ MANIFEST (URL theo locale), KHÔNG trả dữ liệu
// index inline — tránh gửi hàng MB index vào bundle client (tiêu chí #2).
// - Dev: middleware phục vụ `*/search-index/<locale>.json` bằng buildSearchIndex on-the-fly (không cache).
// - Build: search emitter trong build.ts ghi file thật vào dist/search-index/; dev không cần ghi file.

const VIRTUAL_ID = 'virtual:dommief/search-index';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const PREFIX = '/search-index/';

export function dommiefSearchIndexPlugin(state: DommiefState): Plugin {
  return {
    name: 'dommief:search-index',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const config = state.config();
      if (!config.search.enabled) return { code: 'export const manifest = { locales: {} }; export default manifest;\n', map: null };
      const locales = Object.fromEntries((config.locales ?? []).map((l) => [l.id, `${config.base}search-index/${l.id}.json`]));
      return { code: `export const manifest = ${JSON.stringify({ locales })}; export default manifest;\n`, map: null };
    },
    configureServer(s) {
      s.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.endsWith('.json')) return next();
        const base = (state.config().base || '/').replace(/\/$/, '') || '';
        const localPath = base && url.startsWith(base + PREFIX) ? url.slice((base + PREFIX).length) : (url.startsWith(PREFIX) ? url.slice(PREFIX.length) : null);
        if (localPath === null) return next();
        const localeId = localPath.replace(/\.json$/, '');
        if (!state.config().locales?.some((l) => l.id === localeId)) return next();
        if (!state.config().search.enabled) { res.statusCode = 404; return res.end(); }
        try {
          const { buildSearchIndex } = await import('../search.js');
          const { transformMarkdown } = await import('../markdown/index.js');
          const t = state.getTable();
          const routes = t.routes.filter((r) => (r.locale ?? state.config().locales[0]?.id) === localeId);
          // Dev không dùng cache; đọc trực tiếp file .md để có texts (extractPageSummary trong sitePlugin
          // chỉ lấy frontmatter+toc để dựng site module nhẹ, KHÔNG có texts — texts chỉ nằm trong
          // transformMarkdown/PageMeta).
          const resIdx = await buildSearchIndex({
            routes,
            loadPageMeta: async (r) => {
              let raw = '';
              try { raw = fs.readFileSync(r.file, 'utf8'); } catch { raw = ''; }
              const tr = await transformMarkdown(raw, r.file, { hooks: state.host(), byFile: t.byFile, base: state.config().base, code: state.config().markdown });
              return tr.meta;
            },
            config: { locales: state.config().locales },
          });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(resIdx.locales[localeId] ?? {}));
        } catch (e: unknown) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'search index build failed' }));
        }
      });
    },
  };
}
