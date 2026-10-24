import type { Route, NavItem, SidebarGroup, SidebarItem, ResolvedLocale } from './types.js';

export type FrontmatterMap = Record<string, Record<string, unknown>>;

function fmFor(map: FrontmatterMap | undefined, route: Route): Record<string, unknown> {
  if (!map) return {};
  return map[route.id] ?? map[route.file] ?? {};
}

function localeId(route: Route, locales: ResolvedLocale[]): string {
  if (route.locale) return route.locale;
  return locales[0]?.id ?? 'default';
}

function titleOf(route: Route, fm: Record<string, unknown>): string {
  const t = fm.title ?? fm.navTitle ?? fm.sidebarTitle;
  if (typeof t === 'string' && t.trim()) return t;
  return route.id.split('/').pop() ?? route.id;
}

function orderOf(fm: Record<string, unknown>): number {
  const v = fm.order ?? fm.navOrder ?? fm.sidebarOrder;
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

export function buildNav(
  routes: Route[],
  frontmatter?: FrontmatterMap,
  locales: ResolvedLocale[] = [],
): Record<string, NavItem[]> {
  const out: Record<string, NavItem[]> = {};
  const groups = new Map<string, NavItem[]>();
  for (const route of routes) {
    const lid = localeId(route, locales);
    const fm = fmFor(frontmatter, route);
    const navFlag = fm.nav;
    if (navFlag === false) continue;
    const item: NavItem = {
      title: titleOf(route, fm),
      link: route.path,
      order: orderOf(fm),
      activePath: route.path,
    };
    const arr = groups.get(lid) ?? [];
    arr.push(item);
    groups.set(lid, arr);
  }
  for (const [lid, items] of groups) {
    out[lid] = items.sort((a, b) => a.order - b.order || String(a.link).localeCompare(String(b.link)));
  }
  // ensure every locale has an entry
  for (const l of locales) {
    if (!out[l.id]) out[l.id] = [];
  }
  return out;
}

export function buildSidebar(
  routes: Route[],
  frontmatter?: FrontmatterMap,
  locales: ResolvedLocale[] = [],
): Record<string, SidebarGroup[]> {
  const out: Record<string, SidebarGroup[]> = {};
  const byLocale = new Map<string, Map<string, SidebarGroup>>();
  for (const route of routes) {
    const lid = localeId(route, locales);
    const fm = fmFor(frontmatter, route);
    const groupTitle = typeof fm.group === 'string' && fm.group.trim() ? fm.group : (route.id.split('/')[0] ?? 'General');
    const item: SidebarItem = {
      title: titleOf(route, fm),
      link: route.path,
      order: orderOf(fm),
      ...(Object.keys(fm).length ? { frontmatter: fm } : {}),
    };
    let groups = byLocale.get(lid);
    if (!groups) {
      groups = new Map();
      byLocale.set(lid, groups);
    }
    let g = groups.get(groupTitle);
    if (!g) {
      g = { title: groupTitle, order: orderOf(fm), children: [] };
      groups.set(groupTitle, g);
    }
    g.children.push(item);
    g.order = Math.min(g.order, orderOf(fm));
  }
  for (const [lid, groups] of byLocale) {
    const arr = [...groups.values()].map((g) => ({
      ...g,
      children: g.children.sort((a, b) => a.order - b.order || a.link.localeCompare(b.link)),
    }));
    out[lid] = arr.sort((a, b) => a.order - b.order || String(a.title).localeCompare(String(b.title)));
  }
  for (const l of locales) {
    if (!out[l.id]) out[l.id] = [];
  }
  return out;
}

export interface PaginationResult {
  prev?: Route;
  next?: Route;
}

export function paginate(routes: Route[], currentPath: string): PaginationResult {
  const sorted = [...routes].sort((a, b) => a.path.localeCompare(b.path));
  const idx = sorted.findIndex((r) => r.path === currentPath);
  if (idx < 0) return {};
  return {
    ...(idx > 0 ? { prev: sorted[idx - 1] } : {}),
    ...(idx < sorted.length - 1 ? { next: sorted[idx + 1] } : {}),
  };
}

export function parseFrontmatter(fileContent: string): Record<string, unknown> {
  const m = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m || !m[1]) return {};
  const out: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
  const km = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!km || !km[1] || km[2] === undefined) continue;
    let v: unknown = km[2]!.trim();
    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    else if (/^-?\d+(\.\d+)?$/.test(String(v))) v = Number(v);
    else if (typeof v === 'string') v = v.replace(/^['"]|['"]$/g, '');
    out[km[1]!] = v;
  }
  return out;
}
