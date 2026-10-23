export interface Route {
  id: string;
  path: string;
  file: string;
  locale?: string;
  parentId?: string;
}

export interface ResolvedLocale {
  id: string;
  name: string;
  base: string;
  suffix: string;
}

export interface NavItem {
  title: string;
  link?: string;
  order: number;
  activePath: string;
  children?: NavItem[];
}

export interface SidebarItem {
  title: string;
  link: string;
  order: number;
  frontmatter?: Record<string, unknown>;
}

export interface SidebarGroup {
  title?: string;
  order: number;
  children: SidebarItem[];
}

export interface PageSummary { frontmatter: Record<string, unknown>; }

export interface SiteData {
  base: string;
  title: string;
  description?: string;
  locales: ResolvedLocale[];
  themeConfig: Record<string, unknown>;
  routes: Record<string, Route>;
  meta: Record<string, PageSummary>;
  nav: Record<string, NavItem[]>;
  sidebar: Record<string, SidebarGroup[]>;
}

/** Phần config mà tầng route cần — ResolvedConfig (DM-201) thoả cấu trúc này. */
export interface RouteConfig {
  srcDir: string;
  docDirs: { dir: string }[];
  locales: ResolvedLocale[];
  forceKebabCase: boolean;
  cleanUrls: boolean;
}

export interface RouteTable {
  warnings: string[];
  routes: Route[];
  byId: Record<string, Route>;
  byPath: Record<string, Route>;
  byFile: Record<string, Route>;
  configHash: string;
}
