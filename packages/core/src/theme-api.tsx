import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { NavItem, PageSummary, SidebarGroup, SiteData } from './types.js';

export type { SiteData, NavItem, SidebarGroup, TocEntry, PageSummary } from './types.js';

export const SiteContext = createContext<SiteData | null>(null);

export function SiteProvider({ value, children }: { value: SiteData; children?: ReactNode }) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteData(): SiteData {
  const ctx = useContext(SiteContext);
  return (ctx ?? ({} as SiteData));
}

/** Locale của pathname (đã bỏ basename): route khớp → locale của route; không khớp (404) → base locale dài nhất; cuối cùng locale mặc định. */
export function localeIdFor(site: SiteData, pathname: string): string {
  const locales = site.locales ?? [];
  const def = locales[0]?.id ?? '';
  const route = Object.values(site.routes ?? {}).find((r) => r.path === pathname);
  if (route) return route.locale ?? def;
  const hit = locales
    .filter((l) => l.suffix === '' && l.base !== '/' && (pathname + '/').startsWith(l.base))
    .sort((a, b) => b.base.length - a.base.length)[0];
  return hit?.id ?? def;
}

export function useRouteMeta(): PageSummary {
  const site = useSiteData();
  const { pathname } = useLocation();
  const route = Object.values(site.routes ?? {}).find((r) => r.path === pathname);
  return (route ? site.meta?.[route.id] : undefined) ?? { frontmatter: {} };
}

export function useNavData(): NavItem[] {
  const site = useSiteData();
  const { pathname } = useLocation();
  return site.nav?.[localeIdFor(site, pathname)] ?? [];
}

export function useSidebarData(): SidebarGroup[] {
  const site = useSiteData();
  const { pathname } = useLocation();
  return site.sidebar?.[localeIdFor(site, pathname)] ?? [];
}
