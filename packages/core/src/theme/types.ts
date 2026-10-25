export type ThemeSlotName = string;
export type ThemeLayoutName = 'GlobalLayout' | 'DocLayout' | 'DemoLayout';
export type ThemeLocale = string;

export interface ThemePlugin {
  path: string;
}

export interface ThemeManifest {
  root: string;
  builtins: Record<string, string>;
  slots: string[];
  layouts: Record<ThemeLayoutName, string>;
  locales: Record<string, string>;
  plugin: string | null;
}

export interface ThemeLoaderOptions {
  cwd: string;
  theme?: string;
}
