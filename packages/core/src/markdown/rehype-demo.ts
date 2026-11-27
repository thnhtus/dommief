import { visit } from 'unist-util-visit';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
  title?: string;
}

// Cache đọc source file: key `absPath:mtimeMs:size` (cùng kiểu cache docgen — không đọc lại mỗi transform).
const srcCache = new Map<string, string>();

function readDemoSrc(src: string, filePath: string): string | null {
  const base = filePath ? path.dirname(filePath) : process.cwd();
  const abs = path.isAbsolute(src) ? src : path.resolve(base, src);
  try {
    const st = fs.statSync(abs);
    const key = `${abs}:${st.mtimeMs}:${st.size}`;
    const cached = srcCache.get(key);
    if (cached !== undefined) return cached;
    const content = fs.readFileSync(abs, 'utf8');
    srcCache.set(key, content);
    return content;
  } catch {
    return null; // file thiếu hoặc không đọc được → caller warning, không fail build
  }
}

function demoId(source: string, file: string): string {
  return createHash('sha256').update(file + '\n' + source).digest('hex').slice(0, 8);
}

function codeText(node: any): string {
  let out = '';
  visit(node, 'text', (t: any) => { out += t.value; });
  return out;
}

interface DomDemoElement {
  type: 'element';
  tagName: 'DomDemo';
  properties: { id: string; src: string; source: string; title?: string };
  children: never[];
}

function handleCodeSrc(
  node: any,
  filePath: string,
  demos: DemoEntry[],
  warnings: string[]
): DomDemoElement {
  const src = String(node.properties.src);
  const title = node.properties.title ? String(node.properties.title) : undefined;
  let source = codeText(node).trim();
  if (!source) {
    const fileContent = readDemoSrc(src, filePath);
    if (fileContent === null) {
      warnings.push(`demo_src_missing: "${src}" trong ${filePath} không tồn tại`);
    } else {
      source = fileContent.trim();
    }
  }
  const id = demoId(source || src, filePath);
  const entry: DemoEntry = { id, source, src };
  if (title) entry.title = title;
  demos.push(entry);
  const props: DomDemoElement['properties'] = { id, src, source };
  if (title) props.title = title;
  return {
    type: 'element',
    tagName: 'DomDemo',
    properties: props,
    children: [],
  };
}

export function rehypeDemo() {
  return (tree: any, file: any) => {
    const demos: DemoEntry[] = Array.isArray((file.data as any)?.demos) ? (file.data as any).demos : [];
    const warnings: string[] = ((file.data as any) ??= {}).warnings ??= [];
    const filePath = String((file as any).path ?? '');

    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== 'number') return;

      // <code src="./Foo.tsx"> form
      if (node.tagName === 'code' && node.properties?.src) {
        parent.children[index] = handleCodeSrc(node, filePath, demos, warnings);
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
