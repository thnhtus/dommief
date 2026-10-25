import type { Route, SiteData, TocEntry } from './types.js';
import { buildNav, buildSidebar, type FrontmatterMap } from './siteFeatures.js';

// Đặc tả: docs/spec/CONTRACTS.md §4–§6, backlog DM-209.

/** Phần config `virtual:dommief/site` cần (ResolvedConfig của DM-201 thoả). */
export interface SiteModuleConfig {
  base: string;
  title: string;
  description?: string | undefined;
  locales: SiteData['locales'];
  themeConfig?: Record<string, unknown> | undefined;
  frontmatter?: FrontmatterMap | undefined;
  search?: { enabled: boolean } | undefined;
}

/** `meta[id]` cho mỗi route: do caller tính sẵn (sitePlugin dùng `extractPageSummary`, #12 — một nguồn sự thật, không đọc `.md?meta` lần nữa qua import). */
export type SiteModuleMeta = Record<string, { frontmatter: Record<string, unknown>; toc: TocEntry[] }>;

/**
 * Sinh code cho `virtual:dommief/site`. Mọi thứ nhúng thẳng vào JSON (không import `.md?meta`
 * cho từng route — mở một trang trong dev từng kéo theo transform MỌI file md, #12), và không
 * import `virtual:dommief/routes` (hai module invalidate độc lập).
 */
export function createSiteModule({ routes, config, meta }: { routes: Route[]; config: SiteModuleConfig; meta: SiteModuleMeta }): string {
  const routesById = Object.fromEntries(routes.map((r) => [r.id, r]));
  const frontmatter = config.frontmatter ?? {};
  const nav = buildNav(routes, frontmatter, config.locales);
  const sidebar = buildSidebar(routes, frontmatter, config.locales);
  const head = {
    base: config.base,
    title: config.title,
    ...(config.description === undefined ? {} : { description: config.description }),
    locales: config.locales,
    themeConfig: config.themeConfig ?? {},
    routes: routesById,
    search: config.search ?? { enabled: true },
  };
  const json = JSON.stringify(head);
  return `export default {
  ...${json},
  meta: ${JSON.stringify(meta)},
  nav: ${JSON.stringify(nav)},
  sidebar: ${JSON.stringify(sidebar)},
};
`;
}
