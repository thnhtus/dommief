import { visit } from 'unist-util-visit';

export function rehypeLink() {
  return (tree: any) => {
    visit(tree, 'element', (node: any) => {
      if (node.tagName === 'a' && node.properties?.href) {
        const href = String(node.properties.href);
        const m = href.match(/^(.*\.md)(#.*)?$/);
        if (m) {
          node.properties.href = (m[1].replace(/\.md$/, '')) + (m[2] || '');
        }
      }
    });
  };
}
