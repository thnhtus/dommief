import fs from 'node:fs';
import path from 'node:path';
import { winPath } from './utils/path.js';
import type { ResolvedConfig } from './config.js';

export interface ComponentInfo {
  name: string;
  dir: string;
  entry: string | null;
  docs: string[];
}

/** Thư mục quét component: preset `library` coi `src/` là gốc; cho phép override để test/monorepo. */
type LibraryScanConfig = { srcDir?: string };

// Tên entry ưu tiên cho component thư mục.
const ENTRY_CANDIDATES = (dirName: string): string[] => [
  'index.tsx',
  'index.ts',
  `${dirName}.tsx`,
  `${dirName}.ts`,
];

/** Quét `<root>/src` lấy manifest component (depth ≤ 2), chỉ filesystem, không parse TS. */
export function scanComponents({ root, config }: { root: string; config: LibraryScanConfig }): ComponentInfo[] {
  const srcRoot = path.resolve(root, config.srcDir ?? 'src');
  if (!fs.existsSync(srcRoot)) return [];

  const out: ComponentInfo[] = [];
  const entries = fs.readdirSync(srcRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (shouldSkipName(entry.name)) continue;
    const abs = path.join(srcRoot, entry.name);
    if (entry.isDirectory()) {
      out.push(scanComponentDir(abs, entry.name, root));
      scanNested(out, abs, root, 2);
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      // file md rải rác ở gốc src: coi là component doc-only, không có entry/dir component riêng.
      out.push({
        name: baseName(entry.name),
        dir: winPath(srcRoot),
        entry: null,
        docs: [winPath(abs)],
      });
    }
  }

  return out.sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name));
}

function scanNested(out: ComponentInfo[], parent: string, root: string, depth: number): void {
  if (depth > 2) return;
  const entries = fs.readdirSync(parent, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (shouldSkipName(entry.name) || !entry.isDirectory()) continue;
    const abs = path.join(parent, entry.name);
    out.push(scanComponentDir(abs, entry.name, root));
    if (depth < 2) scanNested(out, abs, root, depth + 1);
  }
}

function scanComponentDir(dir: string, dirName: string, _root: string): ComponentInfo {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const entry = pickEntry(dir, dirName, files);
  const docs = files
    .filter((f) => f.isFile() && isMarkdown(f.name))
    .map((f) => winPath(path.join(dir, f.name)))
    .sort((a, b) => a.localeCompare(b));
  return { name: dirName, dir: winPath(dir), entry: entry ? winPath(entry) : null, docs };
}

function pickEntry(dir: string, dirName: string, files: fs.Dirent[]): string | null {
  // So khớp không phân biệt hoa/thường để nhận cả `Card.tsx` cho thư mục `card` (quy ước PascalCase).
  const present = new Map(files.filter((f) => f.isFile()).map((f) => [f.name.toLowerCase(), f.name] as const));
  for (const candidate of ENTRY_CANDIDATES(dirName)) {
    const actual = present.get(candidate.toLowerCase());
    if (actual) return path.join(dir, actual);
  }
  return null;
}

function shouldSkipName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_') || name === 'node_modules';
}

function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

function baseName(name: string): string {
  return name.replace(/\.md$/i, '');
}

/** Tìm entry component trong thư mục theo quy ước ưu tiên của library preset. */
export function findComponentEntry(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const dirName = path.basename(dir);
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const lowerToName = new Map<string, string>();
  for (const f of files) {
    if (f.isFile()) lowerToName.set(f.name.toLowerCase(), f.name);
  }
  for (const candidate of ENTRY_CANDIDATES(dirName)) {
    const actual = lowerToName.get(candidate.toLowerCase());
    if (actual) return path.join(dir, actual);
  }
  // Fallback: khớp tên dir không phân biệt hoa/thường (issue DM-923).
  for (const ext of ['.tsx', '.ts']) {
    const actual = lowerToName.get((dirName + ext).toLowerCase());
    if (actual) return path.join(dir, actual);
  }
  return null;
}

const CORE_ALIAS_BLOCKLIST = new Set(['dommief', 'react', 'react-dom', 'react-router', 'vite']);

type LibraryAliasConfig = Pick<ResolvedConfig, 'root' | 'preset' | 'library'>;

/**
 * Tạo alias package name cho demo library (DM-924).
 * - Chỉ áp khi `preset === 'library'`.
 * - `library.importName` thiếu thì fallback `package.json#name` của project root.
 * - Chặn tên trùng core → warning + bỏ alias.
 */
export function buildLibraryAlias(
  config: LibraryAliasConfig,
  pkgName?: string,
): Record<string, string> {
  if (config.preset !== 'library') return {};

  let importName = config.library.importName;
  if (!importName) importName = pkgName ?? readPackageName(config.root);
  if (!importName) return {};

  if (CORE_ALIAS_BLOCKLIST.has(importName)) {
    console.warn(`library.importName "${importName}" trùng tên core; bỏ alias để tránh xung đột`);
    return {};
  }

  return { [importName]: path.join(config.root, 'src') };
}

function readPackageName(root: string): string | undefined {
  try {
    const raw = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { name?: unknown };
    return typeof pkg.name === 'string' && pkg.name ? pkg.name : undefined;
  } catch {
    return undefined;
  }
}
