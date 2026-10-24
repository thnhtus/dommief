import type { Plugin, ViteDevServer } from 'vite';
import path from 'node:path';
import { buildRouteTable } from '../routes.js';
import { createRoutesModule } from '../routesModule.js';
import type { RouteConfig } from '../types.js';

// Đặc tả: backlog DM-206. Plugin riêng `dommief:routes` để DM-303 invalidate độc lập.
// Cache route table trong plugin; invalidate chỉ khi topology đổi (md thêm/xoá/đổi tên,
// docDirs/srcDir/locales/forceKebabCase đổi). Sửa nội dung md (kể cả frontmatter) KHÔNG invalidate.

export interface RoutesPluginOptions {
  cwd: string;
  config: RouteConfig;
}

export function dommiefRoutesPlugin(opts: RoutesPluginOptions): Plugin {
  const virtualId = 'virtual:dommief/routes';
  const resolvedId = '\0' + virtualId;

  const { cwd, config } = opts;
  let table: ReturnType<typeof buildRouteTable> | null = null;
  let server: ViteDevServer | null = null;

  const getTable = () => (table ??= buildRouteTable({ cwd, config }));

  const invalidate = () => {
    table = null;
    const mod = server?.moduleGraph.getModuleById(resolvedId);
    if (mod) server!.moduleGraph.invalidateModule(mod);
  };

  return {
    name: 'dommief:routes',
    enforce: 'pre',
    configureServer(s) { server = s; },
    resolveId(id) {
      if (id === virtualId) return resolvedId;
      return null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      return { code: createRoutesModule(getTable().routes), map: null };
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
