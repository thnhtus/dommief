import type { Plugin, ViteDevServer } from 'vite';
import { createRoutesModule } from '../routesModule.js';
import type { DommiefState } from './state.js';

// Đặc tả: backlog DM-206. Plugin riêng `dommief:routes` để DM-303 invalidate độc lập.
// Invalidate chỉ khi topology đổi (md thêm/xoá/đổi tên). Sửa nội dung md (kể cả frontmatter) KHÔNG invalidate.

export function dommiefRoutesPlugin(state: DommiefState): Plugin {
  const virtualId = 'virtual:dommief/routes';
  const resolvedId = '\0' + virtualId;
  let server: ViteDevServer | null = null;

  const invalidate = () => {
    state.resetTable();
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
      return { code: createRoutesModule(state.getTable().routes), map: null };
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
