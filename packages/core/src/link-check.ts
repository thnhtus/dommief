import fs from 'node:fs';
import path from 'node:path';
import type { TocItem } from './markdown/index.js';

// Đặc tả: docs/backlog/DM-410.md. Neo vào HTML ĐÃ RENDER (không phải AST markdown): bắt được
// cả href do theme/nav sinh, không chỉ link tác giả viết tay. Không fetch mạng (build tất định,
// chạy offline được) — chỉ kiểm link nội bộ + asset.

export interface LinkRef {
  href: string;
  routeId: string;
  file: string;
  /** `—` khi HTML không có `data-src-line` (href do raw HTML nhúng tay, không qua rehypeLink). */
  line: string;
}

export type LinkIssueCode = 'link_target_missing' | 'link_anchor_missing' | 'link_asset_missing';
export interface LinkIssue { code: LinkIssueCode; ref: LinkRef; }

const HREF_RE = /<a\b[^>]*\shref="([^"]*)"[^>]*>/g;
const ASSET_RE = /<(?:img|link)\b[^>]*\s(?:src|href)="([^"]*)"[^>]*>/g;
const LINE_RE = /\sdata-src-line="(\d+)"/;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, mailto:, //cdn — không phải '/' (nội bộ) hay '#' (anchor)

function extractRefs(re: RegExp, html: string, routeId: string, file: string): LinkRef[] {
  const out: LinkRef[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const href = m[1]!;
    if (!href || href.startsWith('#') || EXTERNAL.test(href)) continue;
    const line = tag.match(LINE_RE)?.[1] ?? '—';
    out.push({ href, routeId, file, line });
  }
  return out;
}

/** Thu link `<a href>` nội bộ + asset `<img src>`/`<link href>` từ HTML đã render của một route. */
export function collect(routeId: string, html: string, file: string): LinkRef[] {
  return [...extractRefs(HREF_RE, html, routeId, file), ...extractRefs(ASSET_RE, html, routeId, file)];
}



export interface CheckOptions {
  byPath: Record<string, { path: string }>;
  /** routeId -> toc; thiếu nghĩa là route bị `ssg.exclude` (không prerender) — bỏ qua anchor check (§ ca h). */
  tocByRoute: Record<string, TocItem[]>;
  base: string;
  /** `outDir` đã BUILD XONG (không phải `public/` nguồn): asset tĩnh được Vite copy thẳng,
   * asset tương đối qua `rehypeImg` được Vite băm tên vào `assets/` — cả 2 chỉ tồn tại ở `outDir`. */
  outDir: string;
}

/** `/sub/guide/intro` (base `/sub/`) -> `/guide/intro`. Bỏ base không idempotent: `/sub/sub/x` vẫn thiếu base lần 2 -> vẫn lỗi route, đúng ý DM-410 ca (e). */
function stripBase(p: string, base: string): string {
  const b = base.replace(/\/$/, '');
  if (b && p.startsWith(b + '/')) return p.slice(b.length) || '/';
  if (b && p === b) return '/';
  return p;
}

export function check(refs: LinkRef[], opts: CheckOptions): LinkIssue[] {
  const issues: LinkIssue[] = [];
  for (const ref of refs) {
    const isAsset = !!ref.href.match(/\.(png|jpe?g|gif|svg|webp|avif|ico|css|woff2?|ttf)(\?.*)?$/i);
    const [rawPath, hash] = ref.href.split('#');
    const cleanPath = (rawPath ?? '').split('?')[0]!;
    if (isAsset) {
      const relPath = stripBase(cleanPath, opts.base) || '/';
      const onDisk = path.join(opts.outDir, decodeURIComponent(relPath));
      if (!fs.existsSync(onDisk)) issues.push({ code: 'link_asset_missing', ref });
      continue;
    }
    const routePath = stripBase(cleanPath, opts.base) || '/';
    const target = opts.byPath[routePath];
    if (!target) {
      issues.push({ code: 'link_target_missing', ref });
      continue;
    }
    if (hash) {
      const toc = opts.tocByRoute[target.path] ?? opts.tocByRoute[routePath];
      // route chưa prerender (ssg.exclude) -> không có toc -> không kiểm (không báo lỗi giả, ca h).
      if (toc !== undefined && !toc.some((t) => t.id === hash)) {
        issues.push({ code: 'link_anchor_missing', ref });
      }
    }
  }
  return issues;
}

const MAX_LINES = 20;

/** Gom 1 lượt, tối đa 20 dòng; không log rải rác lúc kiểm (dễ đọc hơn khi có nhiều lỗi). */
export function formatIssues(issues: LinkIssue[]): string {
  const lines = issues.slice(0, MAX_LINES).map((i) => `${i.ref.file}:${i.ref.line}  ${i.ref.href}  (${i.code})`);
  const rest = issues.length - lines.length;
  if (rest > 0) lines.push(`… và ${rest} lỗi nữa`);
  return lines.join('\n');
}
