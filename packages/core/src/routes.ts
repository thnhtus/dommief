import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DommiefError } from './markdown/errors.js';
import { winPath } from './utils/path.js';
import type { ResolvedLocale, Route, RouteConfig, RouteTable } from './types.js';

// Đặc tả: docs/spec/ROUTING.md §1–§5. Thứ tự bắt buộc trong normalizeRoutes:
// locale → index/README → '.'→'/' → kebab → validate → trùng id/path.

export interface RouteScan { routes: Route[]; warnings: string[] }

const INDEX_NAMES = new Set(['index', 'README']); // case-sensitive (ROUTING §2.3.1)
const SEGMENT_OK = /^[\p{L}\p{N}_-]+$/u;

/**
 * Liệt kê `*.md` (đuôi chữ thường; `.MD`/`.mdx` không nhận) dưới `dir`, absolute POSIX, đã sort.
 * Bỏ tên bắt đầu bằng `.`/`_`, `node_modules`; không theo symlink.
 */
function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_') || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(winPath(p));
    }
  };
  walk(dir);
  return out.sort();
}

/** Route thô: `id` = đường dẫn tương đối docDir bỏ `.md`, `path` tạm = `/${id}`. */
export function scanRoutes({ cwd, config }: { cwd: string; config: RouteConfig }): RouteScan {
  const routes: Route[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const { dir } of config.docDirs) {
    const absDir = path.resolve(cwd, dir);
    if (!fs.existsSync(absDir)) {
      // ponytail: luôn là warning (RouteConfig không biết docDirs có phải mặc định không); CONFIG §3.3 lỗi cứng cho docDirs user khai thuộc config.ts.
      warnings.push(`doc_dir_missing: docDirs "${dir}" không tồn tại (${winPath(absDir)})`);
      continue;
    }
    for (const file of listMarkdownFiles(absDir)) {
      if (seen.has(file)) {
        warnings.push(`route_duplicate_file: ${file} nằm trong nhiều docDirs, giữ docDir khai trước`);
        continue;
      }
      seen.add(file);
      const id = path.posix.relative(winPath(absDir), file).slice(0, -'.md'.length);
      routes.push({ id, path: `/${id}`, file });
    }
  }
  return { routes, warnings };
}

/** ROUTING §3.1 — chỉ áp cho một segment, không tạo/xoá `/`. */
function kebab(segment: string, localeId: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLocaleLowerCase(localeId);
}

interface Normalized {
  route: Route;
  routePath: string; // trước khi ghép locale, dạng 'guide/intro'
  locale: ResolvedLocale;
  suffixStripped: boolean;
  indexName?: string;
  dir: string; // thư mục chứa file, tương đối docDir
  dotted: boolean; // có '.' bị đổi thành '/'
}

/**
 * Từ route thô (scanRoutes) tính `path`/`locale` theo ROUTING §2.2–§2.3, kiểm §4.
 * Không mutate input. Gom mọi lỗi rồi ném **một** DommiefError (code của lỗi đầu tiên).
 */
export function normalizeRoutes(raw: Route[], { cwd, config }: { cwd: string; config: RouteConfig }): RouteScan {
  const warnings: string[] = [];
  const errors: { code: string; message: string }[] = [];
  const show = (file: string) => path.posix.relative(winPath(cwd), file) || file;
  const defaultLocale = config.locales[0]!; // config luôn có ≥1 locale (zod default)
  const items: Normalized[] = [];

  for (const r of raw) {
    const segs = r.id.split('/');
    let name = segs.pop()!;
    const dir = segs.join('/');

    // 1. locale: hậu tố chỉ ở tên file, so theo locale.id, locale khai trước thắng
    let locale = defaultLocale;
    let suffixStripped = false;
    const hit = config.locales.find((l) => name.endsWith('.' + l.id));
    if (hit) {
      locale = hit;
      suffixStripped = true;
      name = name.slice(0, -(hit.id.length + 1));
    } else {
      const last = name.slice(name.lastIndexOf('.') + 1);
      const typo = name.includes('.') && config.locales.find((l) => l.id.toLowerCase() === last.toLowerCase());
      if (typo) warnings.push(`locale_unknown_suffix: ${show(r.file)} có hậu tố ".${last}" gần giống locale "${typo.id}" nhưng không khớp; xử lý như file thường`);
    }

    // 2. index/README chỉ ở segment cuối
    const indexName = INDEX_NAMES.has(name) ? name : undefined;
    const parts = indexName ? segs : [...segs, name];

    // 3. '.' → '/', 4. kebab, bỏ segment rỗng, NFC
    const split = parts.flatMap((s) => s.split('.'));
    const dotted = split.length !== parts.length;
    const routePath = split
      .filter(Boolean)
      .map((s) => (config.forceKebabCase ? kebab(s, locale.id) : s))
      .join('/')
      .normalize('NFC');

    // 5. validate ký tự (trước khi ghép suffix locale, vì suffix có '.')
    const bad = routePath.split('/').find((s) => s && !SEGMENT_OK.test(s));
    if (bad) {
      const ch = [...bad].find((c) => !SEGMENT_OK.test(c))!;
      errors.push({
        code: 'route_invalid_path',
        message: `dommief: routes: ký tự không hợp lệ "${ch}" trong đường dẫn của file\n  ${show(r.file)}\n  segment chỉ được chứa chữ, số, "-" và "_". Đổi tên file.`,
      });
    } else if (/[^\x00-\x7F]/.test(routePath)) {
      warnings.push(`route_non_ascii: ${show(r.file)} → "/${routePath}" có ký tự ngoài ASCII; NFC/NFD và hosting tĩnh có thể lệch, nên đặt tên file ASCII`);
    }

    // ghép locale: suffix mode khi suffix !== '', ngược lại base mode
    const joined = locale.suffix ? `/${routePath}${locale.suffix}` : `${locale.base}${routePath}`;
    const p = joined.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
    items.push({
      // locale mặc định ⇒ không có key (JSON round-trip giữ nguyên object)
      route: { id: r.id, path: p, file: r.file, ...(locale === defaultLocale ? {} : { locale: locale.id }) },
      routePath, locale, suffixStripped, ...(indexName === undefined ? {} : { indexName }), dir, dotted,
    });
  }

  // 6. trùng id (giữa các docDir)
  const byId = new Map<string, Normalized[]>();
  for (const it of items) byId.set(it.route.id, [...(byId.get(it.route.id) ?? []), it]);
  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    errors.push({
      code: 'route_duplicate',
      message: `dommief: routes: trùng route id "${id}" (${group.length} file)\n${group.map((g) => `  ${show(g.route.file)}`).join('\n')}\n  id là đường dẫn tương đối trong docDir. Đổi tên file hoặc tách docDir thành 2 site.`,
    });
  }

  // 7. trùng path — so cả biến thể lowercase để bắt Intro.md/intro.md
  const byPath = new Map<string, Normalized[]>();
  for (const it of items) {
    if ((byId.get(it.route.id)?.length ?? 0) > 1) continue;
    const key = it.route.path.toLowerCase();
    byPath.set(key, [...(byPath.get(key) ?? []), it]);
  }
  for (const group of byPath.values()) {
    if (group.length < 2) continue;
    errors.push({
      code: 'route_duplicate',
      message: `dommief: routes: trùng đường dẫn "${group[0]!.route.path}" (${group.length} file)\n${group.map((g) => `  ${show(g.route.file)}`).join('\n')}\n  nguyên nhân: ${duplicateCause(group[0]!, group[1]!)}`,
    });
  }

  if (errors.length) {
    throw new DommiefError(errors.map((e) => e.message).join('\n\n'), { code: errors[0]!.code });
  }
  return { routes: items.map((it) => it.route), warnings };
}

function duplicateCause(a: Normalized, b: Normalized): string {
  const base = (n: Normalized) => path.posix.basename(n.route.file);
  const stripped = a.suffixStripped ? a : b.suffixStripped ? b : undefined;
  if (stripped && a.locale === b.locale) {
    const other = stripped === a ? b : a;
    const owner = stripped.route.locale ? `locale "${stripped.locale.id}"` : 'locale mặc định';
    return `"${base(stripped)}" thuộc ${owner} nên trùng "${base(other)}"`;
  }
  const dirName = (n: Normalized) => n.dir || '/';
  if (a.indexName && b.indexName) return `cả "${a.indexName}.md" và "${b.indexName}.md" đều gộp vào "${dirName(a)}"`;
  const idx = a.indexName ? a : b.indexName ? b : undefined;
  if (idx) return `"${idx.indexName}.md" gộp vào thư mục "${dirName(idx)}"`;
  if (a.route.id.toLowerCase() === b.route.id.toLowerCase()) return 'trùng sau khi kebab (macOS/Windows không phân biệt hoa thường)';
  if (a.dotted || b.dotted) return '"." trong tên file được đổi thành "/"';
  return 'kebab-case làm hai file trùng nhau';
}

/** sha256 (8 ký tự) của các key ảnh hưởng route. Khác `transformHash` của cache md (DM-406). */
export function routeConfigHash(config: RouteConfig): string {
  const { srcDir, docDirs, locales, forceKebabCase, cleanUrls } = config;
  const json = JSON.stringify({
    srcDir,
    docDirs: docDirs.map((d) => d.dir),
    locales: locales.map(({ id, name, base, suffix }) => ({ id, name, base, suffix })),
    forceKebabCase,
    cleanUrls,
  });
  return createHash('sha256').update(json).digest('hex').slice(0, 8);
}

/** Điểm vào duy nhất của tầng route: scan → normalize → sort → map tra cứu. JSON-safe. */
export function buildRouteTable({ cwd, config }: { cwd: string; config: RouteConfig }): RouteTable {
  const scan = scanRoutes({ cwd, config });
  const norm = normalizeRoutes(scan.routes, { cwd, config });
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const routes = norm.routes.sort((a, b) => cmp(a.path, b.path) || cmp(a.id, b.id));
  const table: RouteTable = {
    warnings: [...scan.warnings, ...norm.warnings],
    routes,
    byId: {},
    byPath: {},
    byFile: {},
    configHash: routeConfigHash(config),
  };
  for (const r of routes) {
    table.byId[r.id] = r;
    table.byPath[r.path] = r;
    table.byFile[r.file] = r;
  }
  return table;
}
