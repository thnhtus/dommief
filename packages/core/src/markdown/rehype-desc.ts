import { visit } from 'unist-util-visit';

export function rehypeDesc() {
  return (tree: any, file: any) => {
    file.data = file.data || {};
    let desc: string | undefined;
    visit(tree, 'element', (node: any) => {
      if (!desc && node.tagName === 'p') {
        const text = (node.children || []).map((c: any) => c.value || '').join('').trim();
        if (text) desc = text.slice(0, 160);
      }
    });
    if (desc) {
      if (!file.data.frontmatter) file.data.frontmatter = {};
      if (file.data.frontmatter.description == null) file.data.frontmatter.description = desc;
    }
  };
}

export function rehypeStrip() {
  // strip dangerous raw html? minimal: remove script tags
  return (tree: any) => {
    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (node.tagName === 'script' && parent && index !== undefined) {
        parent.children.splice(index, 1);
        return index; // restart
      }
    });
  };
}
