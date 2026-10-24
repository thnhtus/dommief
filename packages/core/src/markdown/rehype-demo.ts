import { visit } from 'unist-util-visit';
import { createHash } from 'node:crypto';

export interface DemoEntry {
  id: string;
  source: string;
  loader: () => Promise<any>;
}

function demoId(source: string, file: string): string {
  return createHash('sha256').update(file + '\n' + source).digest('hex').slice(0, 8);
}

function codeText(node: any): string {
  let out = '';
  visit(node, 'text', (t: any) => { out += t.value; });
  return out;
}

function langOf(codeNode: any): string {
  const cls = codeNode?.properties?.className;
  const arr = Array.isArray(cls) ? cls : (cls ? [cls] : []);
  for (const c of arr) {
    const s = String(c);
    const m = s.match(/language-(\w+)/);
    if (m) return m[1] as string;
  }
  return String(codeNode?.properties?.language ?? '');
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
        const abs = src.startsWith('/') ? src : src; // keep as given; md-relative resolution done by caller
        demos.push({ id, source, loader: () => import(/* @vite-ignore */ `${filePath}?demo=${id}`) });
        const replacement = {
          type: 'element',
          tagName: 'DumiDemo',
          properties: { id, src: abs },
          children: [],
        };
        parent.children[index] = replacement;
        return;
      }

      if (node.tagName !== 'pre') return;
      const codeNode = Array.isArray(node.children) ? node.children.find((c: any) => c?.tagName === 'code') : null;
      if (!codeNode) return;
      const lang = langOf(codeNode);
      const meta = String(codeNode.data?.meta ?? node.data?.meta ?? '');
      const isDemo = lang === 'jsx' || lang === 'tsx' || /\bdemo\b/.test(meta);
      if (!isDemo) return;

      const source = codeText(codeNode).replace(/\n$/, '');
      const id = demoId(source, filePath);
      demos.push({ id, source, loader: () => import(/* @vite-ignore */ `${filePath}?demo=${id}`) });
      parent.children[index] = {
        type: 'element',
        tagName: 'DumiDemo',
        properties: { id },
        children: [],
      };
    });

    (file.data as any).demos = demos;
  };
}
