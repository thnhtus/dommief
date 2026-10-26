import { visit } from 'unist-util-visit';
import { createHash } from 'node:crypto';

/**
 * remark: ```tsx demo → đánh dấu `data-demo` lên <code>. Phải làm ở remark vì `rehype-raw`
 * dựng lại cây hast và làm mất `node.data.meta`, còn `hProperties` thì sống sót.
 */
export function remarkDemoMeta() {
  return (tree: any) => {
    visit(tree, 'code', (node: any) => {
      if (/\bdemo\b/.test(String(node.meta ?? ''))) {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, 'data-demo': 'true' } };
      }
    });
  };
}

export interface DemoEntry {
  id: string;
  source: string;
  src?: string;
}

function demoId(source: string, file: string): string {
  return createHash('sha256').update(file + '\n' + source).digest('hex').slice(0, 8);
}

function codeText(node: any): string {
  let out = '';
  visit(node, 'text', (t: any) => { out += t.value; });
  return out;
}

export function rehypeDemo() {
  return (tree: any, file: any) => {
    const demos: DemoEntry[] = Array.isArray((file.data as any)?.demos) ? (file.data as any).demos : [];
    const filePath = String((file as any).path ?? '');

    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== 'number') return;

      // <code src="./Foo.tsx"> form
      if (node.tagName === 'code' && node.properties?.src) {
        const src = String(node.properties.src);
        const source = codeText(node).trim();
        const id = demoId(source || src, filePath);
        demos.push({ id, source, src });
        parent.children[index] = {
          type: 'element',
          tagName: 'DomDemo',
          properties: { id, src, source },
          children: [],
        };
        return;
      }

      if (node.tagName !== 'pre') return;
      const codeNode = Array.isArray(node.children) ? node.children.find((c: any) => c?.tagName === 'code') : null;
      if (!codeNode) return;
      // Chỉ block khai báo `demo` trong meta (```tsx demo) mới là demo; ```tsx thường vẫn là code.
      if (!codeNode.properties?.dataDemo) return;

      const source = codeText(codeNode).replace(/\n$/, '');
      const id = demoId(source, filePath);
      demos.push({ id, source });
      parent.children[index] = {
        type: 'element',
        tagName: 'DomDemo',
        properties: { id, source },
        children: [],
      };
    });

    (file.data as any).demos = demos;
  };
}
