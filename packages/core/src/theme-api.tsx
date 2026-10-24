import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { NavItem, SidebarGroup, SiteData } from './types.js';

export type { SiteData, NavItem, SidebarGroup } from './types.js';

export const SiteContext = createContext<SiteData | null>(null);

export function SiteProvider({ value, children }: { value: SiteData; children?: ReactNode }) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteData(): SiteData {
  const ctx = useContext(SiteContext);
  return (ctx ?? ({} as SiteData));
}

export function useRouteMeta(): { frontmatter: Record<string, unknown>; toc?: unknown; [k: string]: unknown } {
  const site = useSiteData();
  const location = useLocation();
  const route = Object.values(site.routes).find((r) => r.path === location.pathname)
    ?? Object.values(site.routes)[0];
  const meta = route ? site.meta[route.id] : undefined;
  return (meta as any) ?? { frontmatter: {} };
}

export function useNavData(): NavItem[] {
  const site = useSiteData();
  // nav is keyed by locale base path; default to first locale's root
  const keys = Object.keys(site.nav);
  return site.nav[keys[0] ?? '/'] ?? (Object.values(site.nav)[0] ?? []);
}

export function useSidebarData(): SidebarGroup[] {
  const site = useSiteData();
  const location = useLocation();
  return site.sidebar[location.pathname] ?? site.sidebar[Object.keys(site.sidebar)[0] ?? ''] ?? [];
}
