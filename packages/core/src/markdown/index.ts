import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { toEstree } from 'hast-util-to-estree';
import { toJs, jsx } from 'estree-util-to-js';
import { visit } from 'unist-util-visit';
import yaml from 'yaml';
import type { Root as HastRoot } from 'hast';

export interface TocItem { id: string; depth: number; title: string; }
export interface TextFragment { type: 'content'|'title'; value: string; }
export interface PageMeta {
  frontmatter: Record<string, unknown>;
  toc: TocItem[];
  texts: TextFragment[];
}

export async function transformMarkdown(source: string, _file: string): Promise<{ code: string; meta: PageMeta }> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(() => (tree: any, file: any) => {
      // parse frontmatter
      if (tree.children?.[0]?.type === 'yaml') {
        try { file.data.frontmatter = yaml.parse(tree.children[0].value) ?? {}; } catch { file.data.frontmatter = {}; }
        tree.children.shift();
      } else {
        file.data.frontmatter = {};
      }
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw);
  const vfile: any = { data: {} };
  const hast = await processor.run(processor.parse(source), vfile) as HastRoot;
  // collect toc
  const toc: TocItem[] = [];
  const slugger = new (await import('github-slugger')).default();
  visit(hast, 'element', (node: any) => {
    if (/^h[1-6]$/.test(node.tagName)) {
      const text = (node.children || []).map((c: any) => c.value || '').join('').trim();
      const depth = Number(node.tagName.slice(1));
      const id = node.properties?.id || slugger.slug(text);
      if (!node.properties) node.properties = {};
      node.properties.id = id;
      toc.push({ id, depth, title: text });
    }
  });
  // texts
  const texts: TextFragment[] = [];
  visit(hast, 'text', (node: any) => {
    const v = (node.value || '').trim();
    if (v) texts.push({ type: 'content', value: v });
  });
  const meta: PageMeta = { frontmatter: vfile.data?.frontmatter ?? {}, toc, texts };

  const estree = toEstree(hast, { elementAttributeNameCase: 'react' }) as any;
  const { value: code } = toJs(estree, { handlers: jsx });
  const finalCode = `import React from 'react';
export default function Content(){ return (
${code.replace(/;\s*$/,'')}
); }
export const meta = ${JSON.stringify(meta)};
`;
  return { code: finalCode, meta };
}
