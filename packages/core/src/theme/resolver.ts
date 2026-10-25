import fs from 'node:fs';
import path from 'node:path';
import { DommiefError } from '../markdown/errors.js';
import type { ResolvedConfig } from '../config.js';
import { loadTheme } from './loader.js';

const EXTS = ['.tsx', '.ts', '.jsx', '.js'];

function pickFile(dir: string, name: string): string | null {
  for (const ext of EXTS) {
    const f = path.join(dir, name + ext);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  const sub = path.join(dir, name);
  if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) {
    for (const ext of EXTS) {
      const f = path.join(sub, 'index' + ext);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
  }
  return null;
}

export type ThemeKind = 'slots' | 'builtins' | 'layouts' | 'locales';

export function resolveSlot(slotName: string, kind: ThemeKind, roots: string[]): string {
  for (const root of roots) {
    const dir = path.join(root, kind);
    const f = pickFile(dir, slotName);
    if (f) return path.resolve(f);
  }
  throw new DommiefError(`thiếu ${kind}/${slotName}`, { code: 'theme_slot_missing' });
}

export interface AliasMap {
  [alias: string]: string;
}

export function buildAliasChain(cwd: string, config: ResolvedConfig): AliasMap {
  const themeName = (config as any).theme ?? 'dommief-theme-default';
  // resolve roots
  const localRoot = path.resolve(cwd, '.dommief', 'theme');
  let manifest: any;
  try { manifest = loadTheme({ cwd, theme: themeName }); } catch { manifest = null; }
  let pkgRoot = manifest?.root ?? path.resolve(cwd, 'node_modules', themeName);
  if (fs.existsSync(path.join(pkgRoot, 'src', 'layouts'))) pkgRoot = path.join(pkgRoot, 'src');
  // default theme root: find in node_modules or repo packages
  let defaultRoot = path.resolve(cwd, 'node_modules', 'dommief-theme-default');
  if (fs.existsSync(path.join(defaultRoot, 'src', 'layouts'))) defaultRoot = path.join(defaultRoot, 'src');
  const roots = [localRoot, pkgRoot, defaultRoot].filter((r) => fs.existsSync(r));

  const aliases: AliasMap = {};
  // dommief/theme -> resolved theme root (package root)
  const themeRoot = (roots[1] ?? roots[0] ?? defaultRoot);
  aliases['dommief/theme'] = themeRoot;

  // slots
  const slotNames = new Set<string>();
  // known slots from theme-default? We'll alias common slots dynamically by scanning all roots
  for (const r of roots) {
    for (const kind of ['slots', 'builtins', 'layouts', 'locales'] as ThemeKind[]) {
      const dir = path.join(r, kind);
      if (!fs.existsSync(dir)) continue;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        let name = e.name;
        if (e.isFile()) {
          const ext = EXTS.find((x) => name.endsWith(x));
          if (ext) name = name.slice(0, -ext.length);
          else continue;
        }
        // directory: check index
        if (e.isDirectory()) {
          const sub = path.join(dir, e.name);
          const hasIndex = EXTS.some((x) => fs.existsSync(path.join(sub, 'index' + x)));
          if (!hasIndex) continue;
        }
        slotNames.add(name);
      }
    }
  }

  for (const name of slotNames) {
    for (const kind of ['slots', 'builtins', 'layouts', 'locales'] as ThemeKind[]) {
      // only alias if any root has it
      const dirs = roots.map((r) => path.join(r, kind));
      if (!dirs.some((d) => fs.existsSync(d))) continue;
      // check existence
      let exists = false;
      for (const r of roots) {
        if (pickFile(path.join(r, kind), name)) { exists = true; break; }
      }
      if (!exists) continue;
      const aliasKey = kind === 'slots' ? `dommief/theme/slots/${name}` :
        kind === 'builtins' ? `dommief/theme/builtins/${name}` :
        kind === 'layouts' ? `dommief/theme/layouts/${name}` :
        `dommief/theme/locales/${name}`;
      try {
        aliases[aliasKey] = resolveSlot(name, kind, roots);
      } catch { /* skip */ }
    }
  }
  // also alias dommief/theme/slots/<Slot> handled above
  return aliases;
}

export function resolveThemeSlots(opts: { cwd: string; config: ResolvedConfig }): AliasMap {
  return buildAliasChain(opts.cwd, opts.config);
}
