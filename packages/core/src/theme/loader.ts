import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DommiefError } from '../markdown/errors.js';
import type { ThemeManifest, ThemeLoaderOptions, ThemeLayoutName } from './types.js';

// Đặc tả: docs/spec/THEME-API.md §2, backlog DM-501.
// Luật quét giữ y dumi (`features/theme/loader.ts`): chỉ file/thư mục tên bắt đầu bằng chữ HOA
// hoặc chữ số mới được coi là component; `Foo.ext` và `Foo/index.ext` cho CÙNG specifier `Foo`.

const EXTS = ['.tsx', '.ts', '.jsx', '.js'];
const DEFAULT_THEME = 'dommief-theme-default';

function isComponentName(name: string): boolean {
  return /^[A-Z0-9]/.test(name);
}

/** Thư mục chứa `packages/` của chính monorepo dommief (để test/dev dùng theme-default từ source, không cần build trước). */
function repoPackagesDir(): string | null {
  let cur = path.dirname(fileURLToPath(import.meta.url));
  while (cur !== path.parse(cur).root) {
    if (fs.existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return path.join(cur, 'packages');
    cur = path.dirname(cur);
  }
  return null;
}

function assertInside(cwd: string, target: string, theme: string): void {
  const rel = path.relative(cwd, target);
  const insideCwd = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  const insideNodeModules = target.split(path.sep).includes('node_modules');
  if (!insideCwd && !insideNodeModules) {
    throw new DommiefError(`đường dẫn theme "${theme}" thoát ra ngoài thư mục dự án: ${target}`, { code: 'theme_path_escape', file: target });
  }
}

/** `theme` là path tương đối (bắt đầu bằng `.`), tên package trong `node_modules`, hoặc tên package nguồn trong monorepo (chỉ khi dev/test dommief chính nó). */
export function resolveThemeRoot(cwd: string, theme: string): string {
  const isPathLike = theme.startsWith('.') || theme.startsWith('/');
  let root: string | null = null;
  if (isPathLike) {
    // Chỉ ĐƯỜNG DẪN tường minh (`theme: './my-theme'`) mới chịu kiểm "không thoát khỏi dự án":
    // đây là input user viết tay trong config, khác với resolve theo tên package (node_modules/
    // workspace symlink đã tự do trỏ ra ngoài cwd theo thiết kế của Node/pnpm).
    const candidate = path.resolve(cwd, theme);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) root = candidate;
    if (!root) throw new DommiefError(`không tìm thấy theme tại đường dẫn "${theme}"`, { code: 'theme_package_not_found' });
    assertInside(cwd, root, theme);
  } else {
    const nmCandidate = path.resolve(cwd, 'node_modules', theme);
    if (fs.existsSync(nmCandidate)) root = nmCandidate;
    else {
      // Fallback chỉ dùng khi chạy BÊN TRONG chính monorepo dommief (test/dogfood không cài qua
      // node_modules): không áp dụng assertInside vì đây là quy ước nội bộ, không phải input user.
      const packages = repoPackagesDir();
      const pkgDirName = theme === DEFAULT_THEME ? 'theme-default' : theme;
      const srcCandidate = packages ? path.join(packages, pkgDirName) : null;
      if (srcCandidate && fs.existsSync(srcCandidate)) root = srcCandidate;
    }
    if (!root) {
      throw new DommiefError(`không tìm thấy theme package "${theme}" (đã thử node_modules/${theme})`, { code: 'theme_package_not_found' });
    }
  }
  // Package nguồn trong monorepo (hoặc workspace link): component nằm ở `src/`, không phải `dist/`.
  if (fs.existsSync(path.join(root, 'src', 'layouts'))) root = path.join(root, 'src');
  return root;
}

function pickEntry(dir: string, name: string): string | null {
  for (const ext of EXTS) {
    const f = path.join(dir, name + ext);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  const subIndexDir = path.join(dir, name);
  if (fs.existsSync(subIndexDir) && fs.statSync(subIndexDir).isDirectory()) {
    for (const ext of EXTS) {
      const f = path.join(subIndexDir, 'index' + ext);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
  }
  return null;
}

/** Quét một thư mục (`slots/`, `builtins/`) ra `specifier -> absolute path`, theo luật "chữ hoa/chữ số đầu". */
export function scanComponents(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (!isComponentName(name)) continue;
    if (entry.isFile()) {
      const ext = EXTS.find((e) => name.endsWith(e));
      if (!ext) continue;
      const specifier = name.slice(0, -ext.length);
      if (!isComponentName(specifier)) continue;
      out[specifier] ??= path.resolve(dir, name);
    } else if (entry.isDirectory()) {
      const found = pickEntry(dir, name);
      if (found) out[name] = path.resolve(found);
    }
  }
  return out;
}

function scanLocales(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      out[entry.name.slice(0, -'.json'.length)] = path.resolve(dir, entry.name);
    }
  }
  return out;
}

/** Quét một thư mục theme (đã resolve) ra `ThemeManifest`. KHÔNG áp dụng override — đó là việc của resolver.ts (merge theo từng component qua 2-3 manifest). */
export function loadThemeManifest(root: string, name: string): ThemeManifest {
  const layoutsDir = path.join(root, 'layouts');
  const layouts = {} as Record<ThemeLayoutName, string>;
  const missing: ThemeLayoutName[] = [];
  for (const layoutName of ['GlobalLayout', 'DocLayout', 'DemoLayout'] as const) {
    const p = pickEntry(layoutsDir, layoutName);
    if (p) layouts[layoutName] = p;
    else missing.push(layoutName);
  }
  if (missing.length) {
    throw new DommiefError(`theme "${name}" thiếu layout: ${missing.join(', ')}`, { code: 'theme_layout_missing', file: layoutsDir, layout: missing.join(',') });
  }
  const pluginJs = ['plugin.ts', 'plugin.js', path.join('plugin', 'index.ts'), path.join('plugin', 'index.js')]
    .map((f) => path.join(root, f))
    .find((f) => fs.existsSync(f));
  return {
    name,
    root,
    builtins: scanComponents(path.join(root, 'builtins')),
    slots: scanComponents(path.join(root, 'slots')),
    layouts,
    locales: scanLocales(path.join(root, 'locales')),
    plugin: pluginJs ?? null,
  };
}

/** Resolve + quét theme `opts.theme` (mặc định `dommief-theme-default`). Không áp override local — xem `loadThemeChain` trong resolver.ts. */
export function loadTheme(opts: ThemeLoaderOptions): ThemeManifest {
  const cwd = path.resolve(opts.cwd);
  const theme = opts.theme ?? DEFAULT_THEME;
  const root = resolveThemeRoot(cwd, theme);
  return loadThemeManifest(root, theme);
}

export { DEFAULT_THEME };
