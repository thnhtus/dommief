import path from 'node:path';
import { visit } from 'unist-util-visit';
import { winPath } from '../utils/path.js';

export interface RehypeLinkOptions {
  /** file md tuyệt đối (POSIX) → path của route. Không có ⇒ chỉ bỏ đuôi `.md` (không kiểm tra). */
  byFile?: Record<string, { path: string }>;
  /** `config.base` ('/sub/'): `<a>` thường không có basename của router nên phải gắn tiền tố ở đây. */
  base?: string;
}

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i; // http:, mailto:, //cdn, #hash, /abs

/**
 * `[x](./getStarted.md#a)` → path của route thật (`/get-started#a`), tính theo VỊ TRÍ FILE md chứ không theo URL.
 * Link `.md` không khớp route nào được giữ nguyên và ghi warning vào `file.data.warnings`.
 */
export function rehypeLink(options: RehypeLinkOptions = {}) {
  return (tree: any, file: any) => {
    const from = winPath(String(file?.path ?? ''));
    const prefix = (options.base ?? '/').replace(/\/$/, '');
    const warnings: string[] = Array.isArray(file?.data?.warnings) ? file.data.warnings : [];
    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'a' || !node.properties?.href) return;
      const href = String(node.properties.href);
      if (EXTERNAL.test(href)) return;
      const m = href.match(/^([^#?]*\.md)([?#].*)?$/);
      if (!m || m[1] === undefined) return;
      const tail = m[2] ?? '';
      if (!options.byFile) {
        node.properties.href = m[1].replace(/\.md$/, '') + tail;
        return;
      }
      const abs = path.posix.resolve(path.posix.dirname(from), m[1]);
      const route = options.byFile[abs];
      if (route) node.properties.href = (route.path === '/' ? prefix + '/' : prefix + route.path) + tail;
      else warnings.push(`link_unresolved: "${href}" trong ${from} không trỏ tới file md nào thuộc docDirs`);
    });
    if (file?.data) file.data.warnings = warnings;
  };
}
