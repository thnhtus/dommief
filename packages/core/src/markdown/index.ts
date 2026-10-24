import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { visit } from 'unist-util-visit';
import type { Root as HastRoot } from 'hast';
import { remarkMeta } from './remark-meta.js';
import { rehypeSlug, rehypeAutolinkHeadings } from './rehype-slug.js';
import { rehypeLink } from './rehype-link.js';
import { rehypeImg } from './rehype-img.js';
import { rehypeDesc, rehypeStrip } from './rehype-desc.js';
import { rehypeText } from './rehype-text.js';
import { rehypeDemo } from './rehype-demo.js';
import { rehypeApi } from './rehype-api.js';
import { toModule } from './to-module.js';
import { DommiefError } from './errors.js';
import { createPluginHost, type PluginHookHost } from '../plugins.js';

export interface TocItem { id: string; depth: number; title: string; }
export interface TextFragment { type?: 'content' | 'title'; value: string; paraId?: number; tocIndex?: number; }
export interface PageMeta {
  frontmatter: Record<string, unknown>;
  toc: TocItem[];
  texts: TextFragment[];
}

export interface TransformMarkdownOptions {
  remarkPlugins?: unknown[];
  rehypePlugins?: unknown[];
  hooks?: PluginHookHost;
  plugins?: unknown[];
}
export async function transformMarkdown(source: string, file: string, opts: TransformMarkdownOptions = {}): Promise<{ code: string; meta: PageMeta }> {
  const host = opts.hooks ?? (opts.plugins ? createPluginHost(opts.plugins) : undefined);
  const remarkPlugins = [...(opts.remarkPlugins ?? []), ...(host ? host.collectRemarkPlugins() : [])];
  const rehypePlugins = [...(opts.rehypePlugins ?? []), ...(host ? host.collectRehypePlugins() : [])];
  let processor: any;
  try {
    processor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkGfm)
      .use(remarkMeta, { filename: file });
    for (const p of remarkPlugins) processor = processor.use(p);
    processor = processor
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw);
    for (const p of rehypePlugins) processor = processor.use(p);
    processor = processor
      .use(rehypeSlug)
      .use(rehypeAutolinkHeadings)
      .use(rehypeLink)
      .use(rehypeImg, { base: '/' })
      .use(rehypeDesc)
      .use(rehypeStrip)
      .use(rehypeText)
      .use(rehypeDemo)
      .use(rehypeApi);
  } catch (e) {
    throw new DommiefError('failed to build pipeline', { file });
  }
  const vfile: any = { data: {}, path: file };
  let hast: HastRoot;
  try {
    const tree = processor.parse(source);
    hast = await processor.run(tree, vfile) as HastRoot;
  } catch (e) {
    throw new DommiefError('markdown transform failed: ' + (e as Error).message, { file });
  }
  const meta: PageMeta = {
    frontmatter: (vfile.data?.frontmatter ?? {}) as Record<string, unknown>,
    toc: (vfile.data?.toc ?? []) as TocItem[],
    texts: (vfile.data?.texts ?? []) as TextFragment[],
  };
  const code = toModule(hast, meta);
  return { code, meta };
}
