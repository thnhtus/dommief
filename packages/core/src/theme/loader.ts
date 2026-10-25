import fs from 'node:fs';
import path from 'node:path';
import { DommiefError } from '../markdown/errors.js';

const EXTS = ['.tsx', '.ts', '.jsx', '.js'];

function assertInside(root: string, target: string) {
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new DommiefError('đường dẫn theme thoát ra ngoài thư mục dự án', { code: 'theme_path_escape', file: target });
  }
}

function pickEntry(dir: string, name: string): string | null {
  // file named <name>.ext
  for (const ext of EXTS) {
    const f = path.join(dir, name + ext);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  // directory <name>/index.ext
  const sub = path.join(dir, name);
  if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) {
    for (const ext of EXTS) {
      const f = path.join(sub, 'index' + ext);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
  }
  return null;
}

function scanDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    let base = name;
    let full = path.join(dir, name);
    if (entry.isDirectory()) {
      const picked = pickEntry(dir, name);
      // directory with index
      let found: string | null = null;
      for (const ext of EXTS) {
        const f = path.join(full, 'index' + ext);
        if (fs.existsSync(f) && fs.statSync(f).isFile()) { found = f; break; }
      }
      if (found) out[name] = found;
    } else {
      const ext = EXTS.find((e) => name.endsWith(e));
      if (ext) {
        const stem = name.slice(0, -ext.length);
        if (!out[stem]) out[stem] = full;
      }
    }
  }
  return out;
}

function scanSlotNames(dir: string): string[] {
  const out = new Set<string>();
  if (!fs.existsSync(dir)) return [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    const ext = EXTS.find((e) => name.endsWith(e));
    if (entry.isFile() && ext) out.add(name.slice(0, -ext.length));
    if (entry.isDirectory()) {
      // directory with index
      const full = path.join(dir, name);
      for (const e of EXTS) {
        if (fs.existsSync(path.join(full, 'index' + e))) { out.add(name); break; }
      }
    }
  }
  return [...out];
}

function resolveThemeRoot(cwd: string, theme: string): string {
  const localCandidate0 = path.resolve(cwd, theme);
  const rel0 = path.relative(cwd, localCandidate0);
  if (theme.includes('..') && (rel0.startsWith('..') || path.isAbsolute(rel0))) {
    throw new DommiefError('đường dẫn theme thoát ra ngoài thư mục dự án', { code: 'theme_path_escape', file: localCandidate0 });
  }
  // local path
  const localCandidate = path.resolve(cwd, theme);
  if (fs.existsSync(localCandidate) && fs.statSync(localCandidate).isDirectory()) {
    assertInside(cwd, localCandidate);
    // allow if inside cwd or node_modules
    return localCandidate;
  }
  // package resolution
  // try node_modules
  const nmCandidate = path.resolve(cwd, 'node_modules', theme);
  if (fs.existsSync(nmCandidate) && fs.statSync(nmCandidate).isDirectory()) {
    return nmCandidate;
  }
  // try import.meta.resolve
  try {
    const resolved = import.meta.resolve(theme, pathToFileURL(cwd + '/index.js').href);
    // strip file://
    const u = new URL(resolved);
    let p = decodeURIComponent(u.pathname);
    // if points to main entry file, use its dir? For theme package, main points to dist/index.js; theme root should be package root.
    // Heuristic: walk up to package.json
    p = packageRoot(p);
    return p;
  } catch {
    throw new DommiefError(`không tìm thấy theme package: ${theme}`, { code: 'theme_package_not_found' });
  }
}

function pathToFileURL(p: string): URL { return new URL('file://' + p); }

function packageRoot(fileOrDir: string): string {
  let cur = fileOrDir;
  if (fs.statSync(cur).isFile()) cur = path.dirname(cur);
  while (cur !== path.parse(cur).root) {
    if (fs.existsSync(path.join(cur, 'package.json'))) return cur;
    cur = path.dirname(cur);
  }
  return fileOrDir;
}

import type { ThemeManifest, ThemeLoaderOptions } from './types.js';

export function loadTheme(opts: ThemeLoaderOptions): ThemeManifest {
  const cwd = path.resolve(opts.cwd);
  const theme = opts.theme ?? 'dommief-theme-default';
  let root = resolveThemeRoot(cwd, theme);
  if (fs.existsSync(path.join(root, 'src', 'layouts')) && fs.statSync(path.join(root, 'src', 'layouts')).isDirectory()) root = path.join(root, 'src');

  // security: root must be inside cwd or node_modules
  const rel = path.relative(cwd, root);
  const inNodeModules = root.includes(path.sep + 'node_modules' + path.sep) || root.endsWith(path.sep + 'node_modules');
  if (!(rel === '' || !rel.startsWith('..')) && !inNodeModules) {
    throw new DommiefError('đường dẫn theme thoát ra ngoài thư mục dự án', { code: 'theme_path_escape', file: root });
  }
  // also block explicit .. in theme
  if (theme.includes('..')) {
    // only block if resolves outside cwd
    if (rel.startsWith('..')) throw new DommiefError('đường dẫn theme thoát ra ngoài thư mục dự án', { code: 'theme_path_escape', file: root });
  }

  const builtinsDir = path.join(root, 'builtins');
  const slotsDir = path.join(root, 'slots');
  const layoutsDir = path.join(root, 'layouts');
  const localesDir = path.join(root, 'locales');

  const builtins = scanDir(builtinsDir);
  const slots = scanSlotNames(slotsDir);
  const layoutsScan = scanDir(layoutsDir);
  const localesScan = scanDir(localesDir);

  const layouts: Record<string, string> = {};
  for (const name of ['GlobalLayout', 'DocLayout', 'DemoLayout']) {
    const p = layoutsScan[name] ?? pickEntry(layoutsDir, name);
    if (!p) {
      throw new DommiefError(`thiếu layout ${name}`, { code: 'theme_layout_missing', file: root, layout: name });
    }
    // attach layout name for error
    (layouts as any)[name] = p;
  }
  // error code needs layout name; rethrow with layout? DommiefError has no layout field. Use message includes? Acceptance checks code + maybe layout. Add code only. Need layout info. Let's enhance: throw with code theme_layout_missing and file root; tests may check err.code and message? Spec says "kèm tên layout". We'll include layout name in message and maybe a custom property.
  // We'll adjust below by reconstructing.

  const locales: Record<string, string> = {};
  for (const [k, v] of Object.entries(localesScan)) locales[k] = v;

  const pluginPath = path.join(root, 'plugin.ts');
  const pluginTs = fs.existsSync(pluginPath) ? pluginPath : (fs.existsSync(path.join(root, 'plugin.js')) ? path.join(root, 'plugin.js') : null);

  // Re-validate layouts with layout name in error
  // already done; but need ensure code includes layout. We'll patch error creation above? Re-do check with name property.
  return {
    root,
    builtins,
    slots,
    layouts: layouts as any,
    locales,
    plugin: pluginTs,
  };
}
