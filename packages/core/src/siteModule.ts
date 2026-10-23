import { winPath } from './utils/path.js';
import type { Route, SiteData } from './types.js';

// Đặc tả: docs/spec/CONTRACTS.md §4–§6, backlog DM-209.

/** Phần config `virtual:dommief/site` cần (ResolvedConfig của DM-201 thoả). */
export interface SiteModuleConfig {
  base: string;
  title: string;
  description?: string | undefined;
  locales: SiteData['locales'];
  themeConfig?: Record<string, unknown> | undefined;
}

/**
 * Sinh code cho `virtual:dommief/site`. `meta[id]` lấy từ import tường minh
 * `"/abs/file.md?meta"` (chỉ frontmatter) — không `import.meta.glob` (không nhận glob
 * ngoài root), không import `virtual:dommief/routes` (hai module invalidate độc lập).
 * `nav`/`sidebar` rỗng ở Phase 2 (DM-701/702 điền).
 */
export function createSiteModule({ routes, config }: { routes: Route[]; config: SiteModuleConfig }): string {
  const imports = routes.map((r, i) => `import meta${i} from ${JSON.stringify(winPath(r.file) + '?meta')};`);
  const routesById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const meta = routes.map((r, i) => `    ${JSON.stringify(r.id)}: { frontmatter: meta${i}.frontmatter ?? {} },`);
  const head = {
    base: config.base,
    title: config.title,
    ...(config.description === undefined ? {} : { description: config.description }),
    locales: config.locales,
    themeConfig: config.themeConfig ?? {},
    routes: routesById,
  };
  const json = JSON.stringify(head);
  return `${imports.join('\n')}
export default {
  ...${json},
  meta: {
${meta.join('\n')}
  },
  nav: {},
  sidebar: {},
};
`;
}
