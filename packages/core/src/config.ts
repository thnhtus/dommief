import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';
import { DommiefError } from './markdown/errors.js';
import type { ResolvedLocale, RouteConfig } from './types.js';

export type { ResolvedLocale } from './types.js';

// Subset of CONFIG §1 needed by Phase 2 (DM-201). DM-901 extends it without restructuring.
const LocaleInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  base: z.string().startsWith('/', 'phải bắt đầu bằng "/"').optional(),
  suffix: z.string().optional(),
});

export const ConfigSchema = z
  .object({
    title: z.string().default('Dommief'),
    description: z.string().optional(),
    base: z.string().startsWith('/', 'phải bắt đầu bằng "/" (URL tuyệt đối không được hỗ trợ)').default('/'),
    outDir: z.string().default('dist'),
    srcDir: z.string().default('docs'),
    docDirs: z.array(z.union([z.string(), z.object({ dir: z.string() })])).optional(),
    cleanUrls: z.boolean().default(true),
    forceKebabCase: z.boolean().default(true),
    locales: z.array(LocaleInputSchema).default([{ id: 'en-US', name: 'English' }]),
    themeConfig: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

/** What the user writes in dommief.config.ts (input type: optional fields, locale union fields). */
export type UserConfig = z.input<typeof ConfigSchema>;

export interface ResolvedConfig extends RouteConfig {
  /** Absolute cwd the config was resolved against. */
  root: string;
  title: string;
  description?: string;
  base: string;
  outDir: string;
  themeConfig: Record<string, unknown>;
}

export interface ResolveOptions {
  cwd: string;
  cli?: { base?: string | undefined; outDir?: string | undefined };
  env?: Record<string, string | undefined>;
  /** Path of the loaded config file; only used to name the source in errors. */
  configFile?: string | undefined;
}

export function defineConfig(config: UserConfig): UserConfig {
  return config;
}

const CONFIG_FILES = ['dommief.config.ts', 'dommief.config.mts', 'dommief.config.js', 'dommief.config.mjs'];

export async function loadConfigFile(opts: { cwd: string; configPath?: string }): Promise<{ path: string; config: UserConfig } | null> {
  let file: string | undefined;
  if (opts.configPath) {
    file = path.resolve(opts.cwd, opts.configPath);
    if (!fs.existsSync(file)) throw new DommiefError(`không tìm thấy file config: ${file}`, { code: 'config_not_found', file });
  } else {
    file = CONFIG_FILES.map((f) => path.join(opts.cwd, f)).find((p) => fs.existsSync(p));
    if (!file) return null;
  }
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, file, opts.cwd, 'silent');
  if (!loaded) return null;
  return { path: loaded.path, config: loaded.config as UserConfig };
}

export function normalizeBase(base: string): string {
  return base.endsWith('/') ? base : base + '/';
}

export function resolveConfig(userConfig: UserConfig, opts: ResolveOptions): ResolvedConfig {
  const fileLabel = opts.configFile ? path.basename(opts.configFile) : 'dommief.config';
  const sources: Record<string, string> = {};
  for (const k of Object.keys(userConfig ?? {})) sources[k] = fileLabel;

  // ponytail: shallow merge is exact while CLI/env only set top-level scalars (base, outDir).
  // DM-901 adds sitemap.hostname / ssg.concurrency → switch to deep merge (objects deep, arrays replace).
  const merged: Record<string, unknown> = { ...userConfig };
  const layer = (key: string, value: string | undefined, source: string) => {
    if (value === undefined || value === '') return;
    merged[key] = value;
    sources[key] = source;
  };
  layer('base', opts.cli?.base, '--base');
  layer('outDir', opts.cli?.outDir, '--out-dir');
  layer('base', opts.env?.DOMMIEF_BASE, 'DOMMIEF_BASE'); // env beats CLI (CONFIG §3.1) — on purpose
  layer('outDir', opts.env?.DOMMIEF_OUT_DIR, 'DOMMIEF_OUT_DIR');

  const fail = (keyPath: (string | number)[], message: string): never => {
    const top = String(keyPath[0] ?? '');
    const value = keyPath.reduce<unknown>((v, k) => (v as Record<string | number, unknown> | undefined)?.[k], merged);
    const shown = value === undefined ? '(thiếu)' : JSON.stringify(value);
    throw new DommiefError(
      `cấu hình không hợp lệ\n  ${formatKeyPath(keyPath)}  ${shown}\n    ${message}\n    (nguồn: ${sources[top] ?? 'default'})`,
      { code: 'config_invalid' },
    );
  };

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    if (issue.code === 'unrecognized_keys') {
      const key = issue.keys[0]!;
      const hint = suggestKey(key);
      fail([key], `key không được hỗ trợ${hint ? `; bạn muốn nói "${hint}"?` : ''}`);
    }
    fail(issue.path as (string | number)[], issue.message);
  }
  const c = parsed.data!;

  const locales = resolveLocales(c.locales, fail);
  const config: ResolvedConfig = {
    root: opts.cwd,
    title: c.title,
    base: normalizeBase(c.base),
    outDir: c.outDir,
    srcDir: c.srcDir,
    docDirs: (c.docDirs ?? [c.srcDir]).map((d) => (typeof d === 'string' ? { dir: d } : { dir: d.dir })),
    cleanUrls: c.cleanUrls,
    forceKebabCase: c.forceKebabCase,
    locales,
    themeConfig: c.themeConfig,
  };
  if (c.description !== undefined) config.description = c.description;
  return config;
}

/** Kept for vite/plugin.ts: load file at `root` + resolve with process env. */
export async function loadConfig(root: string): Promise<ResolvedConfig> {
  const file = await loadConfigFile({ cwd: root });
  return resolveConfig(file?.config ?? {}, { cwd: root, env: process.env, configFile: file?.path });
}

function resolveLocales(
  input: z.output<typeof LocaleInputSchema>[],
  fail: (keyPath: (string | number)[], message: string) => never,
): ResolvedLocale[] {
  // Mode is decided by locales[0] (CONFIG §1.2.1: base and suffix modes are mutually exclusive).
  const suffixMode = input[0]?.suffix !== undefined;
  const seen = new Set<string>();
  return input.map((l, i) => {
    if (seen.has(l.id)) fail(['locales', i, 'id'], `id "${l.id}" bị trùng`);
    seen.add(l.id);
    const name = l.name ?? l.id;
    if (suffixMode) {
      if (l.base !== undefined || l.suffix === undefined) {
        fail(['locales', i], 'không trộn "base" và "suffix": locales[0] dùng chế độ suffix nên mọi locale phải khai "suffix" và không khai "base"');
      }
      return { id: l.id, name, base: '/', suffix: l.suffix! };
    }
    if (l.suffix !== undefined) {
      fail(['locales', i], 'không trộn "base" và "suffix": locales[0] dùng chế độ base nên không locale nào được khai "suffix"');
    }
    const base = normalizeBase(l.base ?? (i === 0 ? '/' : `/${l.id}/`));
    if (i > 0 && base === '/') {
      fail(['locales', i, 'base'], `chỉ locale đầu tiên được dùng base "/". Đưa "${l.id}" lên đầu mảng hoặc đổi base.`);
    }
    return { id: l.id, name, base, suffix: '' };
  });
}

function formatKeyPath(keyPath: (string | number)[]): string {
  return keyPath.map((k, i) => (typeof k === 'number' ? `[${k}]` : i === 0 ? k : `.${k}`)).join('');
}

function suggestKey(key: string): string | undefined {
  let best: string | undefined;
  let bestDist = 3; // only suggest within edit distance ≤ 2
  for (const known of Object.keys(ConfigSchema.shape)) {
    const d = editDistance(key, known);
    if (d < bestDist) [best, bestDist] = [known, d];
  }
  return best;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}
