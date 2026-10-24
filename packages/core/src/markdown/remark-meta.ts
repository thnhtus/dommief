import yaml from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import Slugger from 'github-slugger';
import { visit } from 'unist-util-visit';
import type { TocItem } from './index.js';

export interface RemarkMetaOptions { filename?: string; }

function textOf(node: any): string {
  let out = '';
  if (node.type === 'text') out += node.value || '';
  if (node.children) for (const c of node.children) out += textOf(c);
  return out;
}

/** Parser frontmatter dùng chung (yaml thật, không phải regex tự chế — tránh #12). */
export function parseFrontmatterYaml(raw: string, opts: { file?: string; onWarn?: (msg: string) => void } = {}): Record<string, unknown> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m || m[1] === undefined) return {};
  try {
    return (yaml.parse(m[1]) as Record<string, unknown>) ?? {};
  } catch (e) {
    opts.onWarn?.(`frontmatter_invalid_yaml: ${opts.file ?? ''}: ${(e as Error).message}`);
    return {};
  }
}

export function remarkMeta(options: RemarkMetaOptions = {}) {
  return (tree: any, file: any) => {
    const filename = options.filename ?? file?.path ?? file?.history?.[0] ?? '';
    file.data = file.data || {};
    // frontmatter: cùng một parser với `parseFrontmatterYaml` (#12) — không tự gọi `yaml.parse` lần thứ hai ở đây.
    let frontmatter: Record<string, unknown> = {};
    if (tree.children?.[0]?.type === 'yaml') {
      frontmatter = parseFrontmatterYaml('---\n' + tree.children[0].value + '\n---', { file: filename });
      tree.children.shift();
    }
    // title fallback from first h1
    if (frontmatter.title == null) {
      let firstH1: string | null = null;
      visit(tree, 'heading', (node: any) => {
        if (node.depth === 1 && firstH1 === null) firstH1 = textOf(node).trim();
      });
      if (firstH1) frontmatter.title = firstH1;
    }
    file.data.frontmatter = frontmatter;
    file.data.filename = filename;
  };
}

/**
 * `frontmatter` + `toc` NHẸ cho `virtual:dommief/site` (#12): chỉ `remark-parse`, không chạy cả
 * pipeline rehype (docgen `<API>`, demo, slug...). Dùng cùng logic title-fallback và cùng
 * `parseFrontmatterYaml` với `remarkMeta`/`transformMarkdown` — một nguồn sự thật cho "title của trang là gì".
 */
export function extractPageSummary(raw: string, file: string, onWarn?: (msg: string) => void): { frontmatter: Record<string, unknown>; toc: TocItem[] } {
  const frontmatter = parseFrontmatterYaml(raw, onWarn ? { file, onWarn } : { file });
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).parse(raw);
  const toc: TocItem[] = [];
  const slugger = new Slugger();
  let firstH1: string | null = null;
  visit(tree, 'heading', (node: any) => {
    const title = textOf(node).trim();
    if (!title) return;
    const id = slugger.slug(title);
    toc.push({ id, depth: node.depth, title });
    if (node.depth === 1 && firstH1 === null) firstH1 = title;
  });
  if (frontmatter.title == null && firstH1) frontmatter.title = firstH1;
  return { frontmatter, toc };
}
