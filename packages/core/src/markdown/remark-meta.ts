import yaml from 'yaml';
import { visit } from 'unist-util-visit';

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
    // frontmatter
    let frontmatter: Record<string, unknown> = {};
    if (tree.children?.[0]?.type === 'yaml') {
      try { frontmatter = yaml.parse(tree.children[0].value) ?? {}; } catch { frontmatter = {}; }
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
