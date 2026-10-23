import { visit } from 'unist-util-visit';
import Slugger from 'github-slugger';

export interface TocItem { id: string; depth: number; title: string; }

function textOf(node: any): string {
  if (node.type === 'text') return node.value || '';
  if (node.children) return node.children.map(textOf).join('');
  return '';
}

export function rehypeSlug() {
  return (tree: any, file: any) => {
    file.data = file.data || {};
    const toc: TocItem[] = [];
    const slugger = new Slugger();
    visit(tree, 'element', (node: any) => {
      if (/^h[1-6]$/.test(node.tagName)) {
        const text = textOf(node).trim();
        const depth = Number(node.tagName.slice(1));
        let id = node.properties?.id;
        if (!id) id = slugger.slug(text);
        if (!node.properties) node.properties = {};
        node.properties.id = id;
        toc.push({ id, depth, title: text });
      }
    });
    file.data.toc = toc;
  };
}

export function rehypeAutolinkHeadings() {
  return (tree: any) => {
    visit(tree, 'element', (node: any) => {
      if (/^h[1-6]$/.test(node.tagName) && node.properties?.id) {
        const anchor = { type: 'element', tagName: 'a', properties: { href: '#' + node.properties.id, className: ['anchor'] }, children: [] };
        node.children = [anchor, ...node.children];
      }
    });
  };
}
