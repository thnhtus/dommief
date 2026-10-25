export type ThemeSlotName = string;
export type ThemeLayoutName = 'GlobalLayout' | 'DocLayout' | 'DemoLayout';

/** Một thư mục theme đã quét (DM-501). Không phải `virtual:dommief/theme` của CONTRACTS §4.3 (hoãn: client không cần biết cấu trúc theme, chỉ cần alias đã resolve — xem resolver.ts). */
export interface ThemeManifest {
  /** Tên package theme (vd 'dommief-theme-default'), chỉ để debug/log. */
  name: string;
  /** Absolute path thư mục theme đã resolve (hoặc thư mục `src` nếu theme nằm trong monorepo nguồn). */
  root: string;
  /** specifier (PascalCase) → absolute path file nguồn. */
  builtins: Record<string, string>;
  /** specifier (PascalCase) → absolute path file nguồn. */
  slots: Record<string, string>;
  /** Chỉ 3 tên hợp lệ; thiếu 1 trong 3 là lỗi (theme không hoàn chỉnh). */
  layouts: Record<ThemeLayoutName, string>;
  /** localeId (vd 'en-US') → absolute path file json. */
  locales: Record<string, string>;
  /** Absolute path tới `plugin.ts`/`plugin.js`, nếu có. */
  plugin: string | null;
}

export interface ThemeLoaderOptions {
  cwd: string;
  theme?: string;
}
