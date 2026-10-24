import type { Plugin, ViteDevServer } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildRouteTable } from '../routes.js';
import { createSiteModule } from '../siteModule.js';
import type { RouteConfig } from '../types.js';

// Đặc tả: backlog DM-209. Plugin riêng `dommief:site` giữ `virtual:dommief/site` nhẹ.
// Invalidate chỉ khi frontmatter của md đổi, md thêm/xoá/đổi tên, hoặc config đổi.
// Sửa thân bài KHÔNG invalidate.

export interface SitePluginOptions {
  cwd: string;
  config: RouteConfig & {
    title: string;
    base: string;
    description?: string | undefined;
    locales: any;
    themeConfig: Record<string, unknown>;
  };
}

function frontmatterHash(file: string): string {
  let raw = '';
  try { raw = readFileSync(file, 'utf8'); } catch { return ''; }
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const block = m?.[1] ?? '';
  return createHash('sha256').update(block).digest('hex').slice(0, 16);
}

export function dommiefSitePlugin(opts: SitePluginOptions): Plugin {
  const virtualId = 'virtual:dommief/site';
  const resolvedId = '\0' + virtualId;

  const { cwd, config } = opts;
  let table: ReturnType<typeof buildRouteTable> | null = null;
  let frontmatterHashes = new Map<string, string>();
  let cache: string | null = null;
  let server: ViteDevServer | null = null;

  const getTable = () => (table ??= buildRouteTable({ cwd, config }));

  const invalidate = () => {
    cache = null;
    table = null;
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
    load() {
      if (cache) return { code: cache, map: null };
      const t = getTable();
      const code = createSiteModule({
        routes: t.routes,
        config: {
          base: config.base,
          title: config.title,
          description: config.description,
          locales: config.locales,
          themeConfig: config.themeConfig,
        },
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
