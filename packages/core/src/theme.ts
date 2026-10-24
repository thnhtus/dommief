import fs from 'node:fs';
import path from 'node:path';

export const LOCAL_THEME_DIR = '.dommief/theme';
export const THEME_PREFIX = 'dommief-theme-';

export interface ThemeComponent {
  specifier: string;
  source: string;
}

export interface ThemeData {
  name: string;
  path: string;
  locales: Record<string, string>;
  builtins: Record<string, ThemeComponent>;
  slots: Record<string, ThemeComponent>;
  layouts: Record<string, ThemeComponent>;
  plugin?: string;
}

const COMPONENT_EXT = /\.(tsx|ts|jsx|js)$/;

function isComponentFile(name: string): boolean {
  return COMPONENT_EXT.test(name) && !name.endsWith('.d.ts');
}

function specifierFromFile(file: string): string {
  // "Foo/index.tsx" -> "Foo"; "Foo.tsx" -> "Foo"
  const noExt = file.replace(COMPONENT_EXT, '');
  const parts = noExt.split('/');
  const last = parts[parts.length - 1]!;
  if (last === 'index' && parts.length > 1) return parts[parts.length - 2]!;
  return last;
}

function walkComponents(dir: string, globRel: RegExp): ThemeComponent[] {
  const out: { rel: string; full: string }[] = [];
  if (!fs.existsSync(dir)) return [];
  const walk = (base: string, rel: string) => {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const full = path.join(base, entry.name);
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, r);
      else if (entry.isFile() && isComponentFile(entry.name)) {
        if (globRel.test(r)) out.push({ rel: r, full });
      }
    }
  };
  walk(dir, '');
  return out.map((f) => ({ specifier: specifierFromFile(f.rel), source: f.full }));
}

export function loadTheme(dir: string): ThemeData | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const builtinsDir = path.join(dir, 'builtins');
  const slotsDir = path.join(dir, 'slots');
  const layoutsDir = path.join(dir, 'layouts');
  const localesDir = path.join(dir, 'locales');

  const toMap = (comps: ThemeComponent[]) =>
    comps.reduce<Record<string, ThemeComponent>>((acc, c) => {
      if (/^[A-Z\d]/.test(c.specifier)) acc[c.specifier] = c;
      return acc;
    }, {});

  const pluginCandidates = ['plugin/index.ts', 'plugin/index.tsx', 'plugin/index.js', 'plugin.ts', 'plugin.js'];
  const plugin = pluginCandidates.map((p) => path.join(dir, p)).find((p) => fs.existsSync(p));

  const locales: Record<string, string> = {};
  if (fs.existsSync(localesDir)) {
    for (const f of fs.readdirSync(localesDir)) {
      if (f.endsWith('.json')) locales[f.replace(/\.json$/, '')] = path.join(localesDir, f);
    }
  }

  return {
    name: path.basename(dir),
    path: dir,
    locales,
    builtins: toMap(walkComponents(builtinsDir, /.*/)),
    slots: toMap(walkComponents(slotsDir, /.*/)),
    layouts: toMap(walkComponents(layoutsDir, /^(GlobalLayout|DocLayout|DemoLayout)(\/index)?\./)),
    ...(plugin ? { plugin } : {}),
  };
}

export function resolveTheme(cwd: string, opts?: { defaultThemePath?: string; pkgTheme?: string }) {
  const localPath = path.join(cwd, LOCAL_THEME_DIR);
  const local = loadTheme(localPath);
  const pkgPath = opts?.pkgTheme ? path.resolve(cwd, 'node_modules', opts.pkgTheme) : undefined;
  const pkg = pkgPath ? loadTheme(pkgPath) : undefined;
  const def = opts?.defaultThemePath ? loadTheme(opts.defaultThemePath) : undefined;
  // merge: default < pkg < local
  const merge = (a?: ThemeData, b?: ThemeData): ThemeData | undefined => {
    if (!a) return b ? { ...b } : undefined;
    if (!b) return { ...a };
    return {
      name: b.name ?? a.name,
      path: b.path ?? a.path,
      locales: { ...a.locales, ...b.locales },
      builtins: { ...a.builtins, ...b.builtins },
      slots: { ...a.slots, ...b.slots },
      layouts: { ...a.layouts, ...b.layouts },
      ...(b.plugin ?? a.plugin ? { plugin: (b.plugin ?? a.plugin)! } : {}),
    };
  };
  let res = merge(def, pkg);
  res = merge(res, local);
  return res;
}
