import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { visit } from 'unist-util-visit';
import type { Root as HastRoot } from 'hast';
import { remarkMeta } from './remark-meta.js';
import { rehypeSlug, rehypeAutolinkHeadings } from './rehype-slug.js';
import { rehypeLink } from './rehype-link.js';
import { rehypeImg } from './rehype-img.js';
import { rehypeDesc, rehypeStrip } from './rehype-desc.js';
import { rehypeTaskList } from './rehype-task-list.js';
import { rehypeText } from './rehype-text.js';
import { rehypeDemo, remarkDemoMeta } from './rehype-demo.js';
import { rehypeApi, buildApiTable } from './rehype-api.js';
import { findComponentEntry } from '../library.js';
import { remarkContainer } from './remark-container.js';
import { remarkCodeMeta, rehypeCode, type RehypeCodeOptions } from './rehype-code.js';
import { toModule } from './to-module.js';
import { DommiefError } from './errors.js';
import { createPluginHost, type PluginHookHost } from '../plugins.js';
import type { ResolvedConfig } from '../config.js';

const warnedDocgenFailures = new Set<string>();

export interface TocItem { id: string; depth: number; title: string; }
export interface TextFragment { type?: 'content' | 'title'; value: string; paraId?: number; tocIndex?: number; skipSearch?: boolean; }
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
  /** file md tuyệt đối → route; để `rehypeLink` đổi `./x.md` thành path route thật. */
  byFile?: Record<string, { path: string; locale?: string; alternates?: Record<string, string> }>;
  /** `config.base` để gắn tiền tố cho link nội bộ. */
  base?: string;
  /** `config.markdown` (shiki + lineNumbers), DM-706. */
  code?: RehypeCodeOptions;
  /** DM-923: cấu hình auto API của preset `library`. */
  library?: { enabled?: boolean; api?: 'off' | 'auto'; root?: string; preset?: 'docs' | 'library' };
  /** DM-923: ResolvedConfig đầy đủ (ưu tiên hơn `library`). */
  config?: Partial<ResolvedConfig> & { preset?: 'docs' | 'library'; library?: { demoDir?: string; importName?: string | undefined; api?: 'off' | 'auto' } };
  /** DM-923: preset shorthand. */
  preset?: 'docs' | 'library';
  /** DM-923: root shorthand. */
  root?: string;
}
export async function transformMarkdown(source: string, file: string, opts: TransformMarkdownOptions = {}): Promise<{ code: string; meta: PageMeta; warnings: string[]; apiSrcFiles: string[]; demos: { id: string; source: string }[] }> {
  const host = opts.hooks ?? (opts.plugins ? createPluginHost(opts.plugins) : undefined);
  const remarkPlugins = [...(opts.remarkPlugins ?? []), ...(host ? host.collectRemarkPlugins() : [])];
  const rehypePlugins = [...(opts.rehypePlugins ?? []), ...(host ? host.collectRehypePlugins() : [])];
  let processor: any;
  try {
    processor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkGfm)
      .use(remarkDirective)
      .use(remarkContainer)
      .use(remarkMeta, { filename: file })
      .use(remarkCodeMeta)
      .use(remarkDemoMeta);
    for (const p of remarkPlugins) processor = processor.use(p);
    processor = processor
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw);
    for (const p of rehypePlugins) processor = processor.use(p);
    processor = processor
      .use(rehypeSlug)
      .use(rehypeAutolinkHeadings)
      .use(rehypeLink, opts.byFile ? { byFile: opts.byFile, base: opts.base ?? '/' } : {})
      .use(rehypeImg)
      .use(rehypeDesc)
      .use(rehypeTaskList)
      .use(rehypeStrip)
      .use(rehypeText)
      .use(rehypeDemo)
      // sau rehypeDemo (fence `demo` đã thành DomDemo) và sau rehypeStrip/rehypeText (§3.16).
      .use(rehypeCode, opts.code ?? {})
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
  const warnings = ((vfile.data?.warnings ?? []) as string[]).slice();
  const apiSrcFiles = ((vfile.data?.apiSrcFiles ?? []) as string[]).slice();
  const meta: PageMeta = {
    frontmatter: (vfile.data?.frontmatter ?? {}) as Record<string, unknown>,
    toc: (vfile.data?.toc ?? []) as TocItem[],
    texts: (vfile.data?.texts ?? []) as TextFragment[],
  };

  // DM-923: tự động inject API table cho preset library khi `library.api === 'auto'`.
  // Điều kiện: md nằm TRỰC TIẾP trong thư mục component có entry + không chứa <API>/<DomApi>/<DumiApi>.
  const cfgAny: any = opts.config ?? {};
  const preset = (cfgAny.preset ?? opts.preset ?? opts.library?.preset ?? 'docs') as 'docs' | 'library';
  const apiMode = (cfgAny.library?.api ?? opts.library?.api ?? 'off') as 'off' | 'auto';
  const enabled = (opts.library?.enabled ?? true) && preset === 'library' && apiMode === 'auto';
  const hasManualApi = /<(API|DomApi|DumiApi)[\s/>]/i.test(source);

  // Kiểm tra title có khai báo trong frontmatter YAML hay không (để fallback displayName).
  const yamlMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const rawFm = yamlMatch && yamlMatch[1] ? yamlMatch[1] : '';
  const hasFrontmatterTitle = /^\s*title\s*:/m.test(rawFm);

  if (enabled && !hasManualApi) {
    const compDir = path.dirname(file);
    const entry = findComponentEntry(compDir);
    if (entry) {
      const rel = path.relative(compDir, entry).split(path.sep).join('/');
      const relSrc = rel.startsWith('.') ? rel : './' + rel;
      const absEntry = path.resolve(compDir, rel);
      if (!apiSrcFiles.includes(absEntry)) apiSrcFiles.push(absEntry);

      // buildApiTable có thể trả null khi docgen fail; cảnh báo gộp 1 lần (per entry).
      const data = buildApiTable(relSrc, file);
      if (!data?.length) {
        const key = 'auto-api-docgen:' + absEntry;
        if (!warnedDocgenFailures.has(key)) {
          warnedDocgenFailures.add(key);
          warnings.push(`<API src="${relSrc}">: ${data === null ? 'file missing or failed to parse' : 'no component found'}: ${absEntry}`);
        }
      }

      // inject node DomApi vào cuối hast (để toModule serialize + import DomApi).
      const node: any = {
        type: 'element',
        tagName: 'DomApi',
        properties: { src: absEntry, data: data ? JSON.stringify(data) : undefined },
        children: [],
      };
      if (!Array.isArray((hast as any).children)) (hast as any).children = [];
      (hast as any).children.push(node);

      // Title fallback: frontmatter thiếu title → displayName docgen, fail → tên thư mục.
      if (!hasFrontmatterTitle) {
        const displayName = data && data.length && data[0] ? data[0].displayName : undefined;
        meta.frontmatter.title = displayName || path.basename(compDir);
      }
    }
    // md nằm ngoài component dir (trang guide thường): bỏ qua im lặng — không phải lỗi.
  }

  const demos = (vfile.data?.demos ?? []) as { id: string; source: string; src?: string }[];
  const code = toModule(hast, meta, (vfile.data?.images ?? []) as { name: string; specifier: string }[], demos);
  return { code, meta, warnings, apiSrcFiles, demos };

}
