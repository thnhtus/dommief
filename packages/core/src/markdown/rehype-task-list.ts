import { visit } from 'unist-util-visit';

const BLOCK = new Set(['ul', 'ol', 'p', 'div', 'pre', 'blockquote', 'table']);

/**
 * GFM task list (`- [ ] foo`) renders a bare disabled checkbox without a label,
 * which fails axe `label` (WCAG 4.1.2). Wrap the checkbox and its inline text in
 * `<label>`, leaving nested lists outside. Handles tight (`li > input`) and loose
 * (`li > p > input`) items.
 */
export function rehypeTaskList() {
  return (tree: any) => {
    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'li' && node.tagName !== 'p') return;
      const kids = node.children ?? [];
      const i = kids.findIndex((c: any) => c.type === 'element' && c.tagName === 'input' && c.properties?.type === 'checkbox');
      if (i < 0) return;
      let end = i + 1;
      while (end < kids.length && !(kids[end].type === 'element' && BLOCK.has(kids[end].tagName))) end++;
      const label = { type: 'element', tagName: 'label', properties: { className: ['task-list-label'] }, children: kids.slice(i, end) };
      node.children = [...kids.slice(0, i), label, ...kids.slice(end)];
    });
  };
}
