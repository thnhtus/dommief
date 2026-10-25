import type { Plugin, ViteDevServer } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSiteModule, type SiteModuleMeta } from '../siteModule.js';
import { extractPageSummary } from '../markdown/remark-meta.js';
import type { DommiefState } from './state.js';

// Đặc tả: backlog DM-209. Plugin riêng `dommief:site` giữ `virtual:dommief/site` nhẹ.
// Invalidate chỉ khi frontmatter của md đổi, md thêm/xoá/đổi tên, hoặc config đổi.
// Sửa thân bài KHÔNG invalidate.

function frontmatterHash(file: string): string {
  let raw: string;
  try { raw = readFileSync(file, 'utf8'); } catch { return ''; }
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const block = m?.[1] ?? '';
  // heading cũng vào hash: `toc` nằm trong site module nên đổi tiêu đề phải invalidate nó.
  const headings = raw.match(/^#{1,6}\s.*$/gm)?.join('\n') ?? '';
  return createHash('sha256').update(block + '\n--\n' + headings).digest('hex').slice(0, 16);
}

export function dommiefSitePlugin(state: DommiefState): Plugin {
  const virtualId = 'virtual:dommief/site';
  const resolvedId = '\0' + virtualId;

  let frontmatterHashes = new Map<string, string>();
  let cache: string | null = null;
  let server: ViteDevServer | null = null;

  const invalidate = () => {
    cache = null;
    state.resetTable();
    const mod = server?.moduleGraph.getModuleById(resolvedId);
    if (mod) server!.moduleGraph.invalidateModule(mod);
  };

  return {
    name: 'dommief:site',
    enforce: 'pre',
    configureServer(s) { server = s; },
    resolveId(id) {
      if (id === virtualId) return resolvedId;
      return null;
    },
    load(this: any, id) {
      if (id !== resolvedId) return null;
      if (cache) return { code: cache, map: null };
      const config = state.config();
      const t = state.getTable();
      // Một lần đọc file cho cả frontmatter lẫn toc (#12): không còn import `.md?meta` riêng
      // cho từng route, nên cả nav/sidebar lẫn `site.meta` đều ra từ cùng một parser.
      const summaries = new Map(t.routes.map((r) => {
        let raw: string;
        try { raw = readFileSync(r.file, 'utf8'); } catch { raw = ''; }
        return [r.id, extractPageSummary(raw, r.file, (m) => this.warn(m))] as const;
      }));
      const frontmatter = Object.fromEntries([...summaries].map(([id, s]) => [id, s.frontmatter]));
      const meta: SiteModuleMeta = Object.fromEntries([...summaries].map(([id, s]) => [id, s]));
      const code = createSiteModule({
        routes: t.routes,
        config: {
          base: config.base,
          title: config.title,
          description: config.description,
          locales: config.locales,
          themeConfig: config.themeConfig,
          frontmatter,
          search: { enabled: config.search.enabled },
        },
        meta,
      });
      // ghi nhớ hash frontmatter hiện tại cho từng file
      frontmatterHashes = new Map(t.routes.map((r) => [r.file, frontmatterHash(r.file)]));
      cache = code;
      return { code, map: null };
    },
    handleHotUpdate(ctx) {
      const id = ctx.file;
      if (!id.endsWith('.md')) return;
      const oldHash = frontmatterHashes.get(id);
      const newHash = frontmatterHash(id);
      // Chưa có hash cũ (site module chưa từng load) ⇒ cache cũng chưa có, không cần invalidate.
      if (oldHash !== undefined && oldHash !== newHash) {
        frontmatterHashes.set(id, newHash);
        invalidate();
      }
      // trả undefined → Vite dùng hành vi mặc định (module trang vẫn HMR)
    },
    watchChange(id, { event }) {
      if (!id.endsWith('.md')) return;
      if (event === 'create' || event === 'delete') {
        invalidate();
        server?.ws.send({ type: 'full-reload' });
      }
    },
  };
}
