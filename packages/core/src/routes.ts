import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'node:fs';

export interface Route { id: string; path: string; file: string; locale?: string; }

export function scanRoutes(root: string, srcDir: string, locales: {id:string}[], forceKebab = false): Route[] {
  const absSrc = path.join(root, srcDir);
  if (!fs.existsSync(absSrc)) return [];
  const files: string[] = [];
  function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) files.push(p);
    }
  }
  walk(absSrc);
  const routes: Route[] = [];
  for (const f of files) {
    const rel = path.relative(absSrc, f).replace(/\\/g, '/');
    // locale suffix detection: foo.zh-CN.md
    let locale: string | undefined;
    let base = rel;
    const m = rel.match(/^(.*)\.([a-zA-Z-]+)\.md$/);
    if (m && locales.some(l => l.id === m[2])) { locale = m[2]; base = m[1] + '.md'; }
    // index/README -> directory
    let routePath = base.replace(/\.md$/, '');
    routePath = routePath.replace(/\/(index|README)$/i, '');
    if (routePath === 'index' || routePath === 'README') routePath = '';
    if (forceKebab) routePath = routePath.split('/').map(s => s.replace(/([a-z])([A-Z])/g,'$1-$2').toLowerCase()).join('/');
    const localePrefix = locale && locale !== 'default' ? '/' + locale : '';
    const p = localePrefix + '/' + routePath;
    const clean = p.replace(/\/+/g,'/').replace(/\/$/,'') || '/';
    routes.push({ id: clean === '/' ? 'index' : clean.slice(1).replace(/\//g,'-'), path: clean, file: f, locale });
  }
  // dedup check
  const seen = new Set<string>();
  for (const r of routes) {
    const key = r.path + '|' + (r.locale ?? '');
    if (seen.has(key)) throw new Error('Duplicate route: ' + r.path);
    seen.add(key);
  }
  return routes;
}
