import MiniSearch from 'minisearch';
import type { Route, ResolvedLocale } from './types.js';
import type { PageMeta, TextFragment } from './markdown/index.js';
import { createMiniSearchConfig, SEARCH_FIELDS, SEARCH_STORE_FIELDS, type MiniSearchConfig } from './search-config.js';

export const INDEX_BUDGET_BYTES_PER_PAGE = 5 * 1024;

// Giữ re-export để không phá import cũ (`from './search.js'`) — nguồn thật đã chuyển sang
// search-config.ts để worker (DM-802) dùng chung mà không kéo theo `minisearch`/Node-only code.
export { createMiniSearchConfig, SEARCH_FIELDS, SEARCH_STORE_FIELDS };
export type { MiniSearchConfig };

export interface SearchDocument {
  id: string;
  routeId: string;
  path: string;
  pageTitle: string;
  sectionTitle: string;
  paraId: number;
  value: string;
  pageKey: string;
  sectionKey: string;
}

export interface BuildSearchIndexOptions {
  routes: Route[];
  loadPageMeta: (route: Route) => PageMeta | Promise<PageMeta>;
  config: { locales: ResolvedLocale[] };
}

export interface BuildSearchIndexResult {
  locales: Record<string, unknown>;
  stats: Record<string, { docs: number; bytes: number; pages: number }>;
  manifest: { locales: Record<string, string> };
}

export async function buildSearchIndex(opts: BuildSearchIndexOptions): Promise<BuildSearchIndexResult> {
  const { routes, loadPageMeta, config } = opts;
  const cfg = createMiniSearchConfig();
  const defaultLocale = config.locales[0]?.id;
  const localesOut: Record<string, unknown> = {};
  const stats: Record<string, { docs: number; bytes: number; pages: number }> = {};
  const manifestLocales: Record<string, string> = {};

  for (const loc of config.locales) {
    const locRoutes = routes.filter((r) => (r.locale ?? defaultLocale) === loc.id);
    if (locRoutes.length === 0) continue;
    const ms = new MiniSearch({
      fields: [...SEARCH_FIELDS],
      storeFields: [...SEARCH_STORE_FIELDS],
      ...cfg,
    });
    const docs: SearchDocument[] = [];
    for (const route of locRoutes) {
      const meta = await loadPageMeta(route);
      const title = (meta.frontmatter?.title as string) || route.id;
      const toc = meta.toc || [];
      const fragments = meta.texts || [];
      // group by tocIndex / orphan
      for (let i = 0; i < fragments.length; i++) {
        const f = fragments[i] as TextFragment;
        const tocIndex = f.tocIndex;
        const sectionTitle = tocIndex !== undefined && toc[tocIndex] ? toc[tocIndex].title : title;
        const pageKey = route.id;
        const sectionKey = `${route.id}::${tocIndex ?? 'orphan'}`;
        docs.push({
          id: `${route.id}#${f.paraId ?? i}#${i}`,
          routeId: route.id,
          path: route.path,
          pageTitle: title,
          sectionTitle,
          paraId: f.paraId ?? 0,
          value: f.value,
          pageKey,
          sectionKey,
        });
      }
    }
    ms.addAll(docs);
    const json = ms.toJSON();
    localesOut[loc.id] = json;
    const bytes = Buffer.byteLength(JSON.stringify(json));
    stats[loc.id] = { docs: docs.length, bytes, pages: locRoutes.length };
    manifestLocales[loc.id] = `/search-index/${loc.id}.json`;
  }

  return { locales: localesOut, stats, manifest: { locales: manifestLocales } };
}
