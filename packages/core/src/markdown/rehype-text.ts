import { visit } from 'unist-util-visit';

export interface TextFragment { type: 'content' | 'title'; value: string; }

export function rehypeText() {
  return (tree: any, file: any) => {
    file.data = file.data || {};
    const texts: TextFragment[] = [];
    visit(tree, 'element', (node: any) => {
      if (/^h[1-6]$/.test(node.tagName)) {
        const v = (node.children || []).map((c: any) => c.value || '').join('').trim();
        if (v) texts.push({ type: 'title', value: v });
      }
    });
    visit(tree, 'text', (node: any) => {
      const v = (node.value || '').replace(/\s+/g, ' ').trim();
      if (v) texts.push({ type: 'content', value: v });
    });
    file.data.texts = texts;
  };
}
