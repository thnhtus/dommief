import { visit } from 'unist-util-visit';
import path from 'node:path';

export function rehypeImg(options: { base?: string } = {}) {
  const base = options.base ?? '/';
  return (tree: any, file: any) => {
    visit(tree, 'element', (node: any) => {
      if (node.tagName === 'img' && node.properties?.src) {
        const src = String(node.properties.src);
        if (!/^https?:\/\//.test(src) && !src.startsWith('/') && !src.startsWith('data:')) {
          const normalized = src.replace(/^\.\//, '');
          node.properties.src = path.posix.join(base.replace(/\/$/, ''), normalized);
        }
      }
    });
  };
}
