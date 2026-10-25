import fs from 'node:fs';
import path from 'node:path';
import { DommiefError } from '../markdown/errors.js';
import type { ResolvedConfig } from '../config.js';
import { loadTheme, loadThemeManifest, DEFAULT_THEME } from './loader.js';
import { scanComponents } from './loader.js';
import type { ThemeLayoutName, ThemeManifest } from './types.js';

// Đặc tả: docs/spec/THEME-API.md §3, backlog DM-502.
// Thứ tự ưu tiên (THẮNG → THUA): `.dommief/theme/**` > theme package (config `theme`) > `dommief-theme-default`.
// Resolve chạy THEO TỪNG component, không theo cả theme: core quét cả 3 nguồn, merge nông theo key.

export type ThemeKind = 'slots' | 'builtins' | 'layouts' | 'locales';
export type AliasMap = Record<string, string>;

export interface ThemeChain {
  /** `.dommief/theme/**` nếu tồn tại (thư mục không cần có cả 4 kind con). */
  local: ThemeManifest | null;
  /** Theme package khai ở config `theme`; bằng `fallback` nếu config trỏ default. */
  pkg: ThemeManifest;
  /** `dommief-theme-default`, luôn là đáy. */
  fallback: ThemeManifest;
}

function tryLoadLocal(cwd: string): ThemeManifest | null {
  const localRoot = path.resolve(cwd, '.dommief', 'theme');
  if (!fs.existsSync(localRoot)) return null;
  // Local override không bắt buộc có layouts (THEME-API §3: override từng component).
  // loadThemeManifest ném lỗi khi thiếu layout -> quét thủ công, không gọi loadThemeManifest.
  const layoutsDir = path.join(localRoot, 'layouts');
  const layouts = {} as Record<ThemeLayoutName, string>;
  for (const name of ['GlobalLayout', 'DocLayout', 'DemoLayout'] as const) {
    const found = scanComponents(layoutsDir)[name];
    if (found) layouts[name] = found;
  }
  return {
    name: '.dommief/theme',
    root: localRoot,
    builtins: scanComponents(path.join(localRoot, 'builtins')),
    slots: scanComponents(path.join(localRoot, 'slots')),
    layouts,
    locales: {},
    plugin: null,
  };
}

/** Quét `.dommief/theme/**` + theme package + `dommief-theme-default`. `pkg === fallback` khi config.theme là mặc định. */
export function loadThemeChain(cwd: string, config: Pick<ResolvedConfig, 'theme'>): ThemeChain {
  const themeName = config.theme ?? DEFAULT_THEME;
  const pkg = loadTheme({ cwd, theme: themeName });
  const fallback = themeName === DEFAULT_THEME ? pkg : loadTheme({ cwd, theme: DEFAULT_THEME });
  return { local: tryLoadLocal(cwd), pkg, fallback };
}

function manifestsOf(chain: ThemeChain): ThemeManifest[] {
  // Thứ tự ưu tiên: local trước (thắng), rồi pkg, rồi fallback. Nếu pkg === fallback, liệt kê 1 lần (không đổi kết quả, chỉ tránh việc lặp vô nghĩa).
  const list = [chain.local, chain.pkg, chain.pkg === chain.fallback ? null : chain.fallback].filter((m): m is ThemeManifest => m !== null);
  return list;
}

/** Trả absolute path thắng của `name` trong `kind`, duyệt `chain` theo thứ tự ưu tiên. Ném lỗi nếu không ai có. */
export function resolveSlot(name: string, kind: ThemeKind, chain: ThemeChain): string {
  for (const m of manifestsOf(chain)) {
    const hit = kind === 'layouts' ? (m.layouts as Record<string, string>)[name] : kind === 'locales' ? m.locales[name] : m[kind][name];
    if (hit) return hit;
  }
  throw new DommiefError(`không có theme nào cung cấp ${kind}/${name}`, { code: 'theme_slot_missing' });
}

/** Danh sách mọi specifier từng xuất hiện trong `kind`, gộp từ cả 3 manifest (để biết override gì có thể alias). */
function allNames(chain: ThemeChain, kind: ThemeKind): string[] {
  const names = new Set<string>();
  for (const m of manifestsOf(chain)) {
    const map = kind === 'layouts' ? m.layouts : kind === 'locales' ? m.locales : m[kind];
    for (const k of Object.keys(map)) names.add(k);
  }
  return [...names];
}

/**
 * Sinh bảng alias Vite cho mọi component đã quét được: `dommief/theme/<kind>/<Name>` → absolute path thắng.
 * Cũng alias `dommief/theme` → root của theme package (không phải local, không phải default — đúng ý
 * "theme đang dùng" cho mục đích debug/log; component thật đi qua alias riêng từng cái).
 */
export function buildAliasChain(cwd: string, config: Pick<ResolvedConfig, 'theme'>): AliasMap {
  const chain = loadThemeChain(cwd, config);
  const aliases: AliasMap = {};
  for (const kind of ['slots', 'builtins', 'layouts'] as const) {
    for (const name of allNames(chain, kind)) {
      aliases[`dommief/theme/${kind}/${name}`] = resolveSlot(name, kind, chain);
    }
  }
  // QUAN TRỌNG: alias tổng quát `dommief/theme` PHẢI được thêm SAU cùng. Vite/`@rollup/plugin-alias`
  // khớp theo thứ tự chuỗi key (object → array, giữ thứ tự chèn) và dùng pattern string TRÙNG
  // PREFIX (`importee.startsWith(pattern + '/')`) — nếu `dommief/theme` đứng TRƯỚC, nó khớp
  // ngay cả `dommief/theme/slots/Footer` và thắng trước alias cụ thể hơn, thay thế đúng đoạn
  // prefix bằng `pkg.root` rồi nối `/slots/Footer` → luôn ra đường dẫn DEFAULT, bỏ qua local
  // override hoàn toàn (đã bắt trực tiếp bằng build-e2e thật: alias đúng nhưng output sai).
  aliases['dommief/theme'] = chain.pkg.root;
  return aliases;
}

/** Merge nông theo key, local > pkg > default (THEME-API §7.5). */
export function mergeLocaleStrings(chain: ThemeChain, localeId: string): Record<string, string> {
  const readJson = (file: string | undefined): Record<string, string> => {
    if (!file) return {};
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  // local override không có bản dịch riêng ở v0.1 (chỉ builtins/slots/layouts) — merge chỉ pkg + fallback.
  return { ...readJson(chain.fallback.locales[localeId]), ...readJson(chain.pkg.locales[localeId]) };
}

export function resolveThemeSlots(opts: { cwd: string; config: Pick<ResolvedConfig, 'theme'> }): AliasMap {
  return buildAliasChain(opts.cwd, opts.config);
}
