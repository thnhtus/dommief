import path from 'node:path';
import { visit } from 'unist-util-visit';

const PLACEHOLDER = '__DOMMIEF_IMG_';
const SKIP = /^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i; // http:, data:, //cdn, #x, /public-abs

/**
 * Ảnh tương đối `./a.png` (theo vị trí file md) được thành `import` để Vite bundle + băm tên + gắn base.
 * Ở đây chỉ đặt placeholder và ghi `file.data.images`; `toModule` sinh dòng import.
 */
export function rehypeImg() {
  return (tree: any, file: any) => {
    const images: { name: string; specifier: string }[] = [];
    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'img' || !node.properties?.src) return;
      const src = String(node.properties.src);
      if (SKIP.test(src)) return;
      const clean = src.replace(/[?#].*$/, '');
      const specifier = clean.startsWith('.') ? clean : './' + path.posix.normalize(clean);
      const name = `${PLACEHOLDER}${images.length}__`;
      images.push({ name, specifier });
      node.properties.src = name;
    });
    // DM-410: như rehype-link.ts, gắn dòng nguồn để link-check báo đúng `file:line` cho asset chết.
    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'img' || !node.properties?.src || node.properties['data-src-line']) return;
      const line = node.position?.start?.line;
      if (line) node.properties['data-src-line'] = String(line);
    });
    file.data = file.data || {};
    file.data.images = images;
  };
}
