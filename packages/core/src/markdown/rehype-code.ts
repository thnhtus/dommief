import { visit } from 'unist-util-visit';
import { bundledLanguages, createHighlighter, type Highlighter } from 'shiki';

// Đặc tả: docs/spec/MARKDOWN.md §3.8 (highlight dòng), §3.16 (rehypeCode), §8 (Shiki lúc build);
// backlog DM-705, DM-706. Highlight MỘT lần lúc transform, gửi HTML tĩnh: không có highlighter
// trong bundle client. `defaultColor: false` bắt buộc — đẩy cả 2 màu vào biến CSS để
// `[data-prefers-color='dark']` đổi màu bằng CSS thuần (§8.2 điểm 2).

export interface ShikiOptions {
  themes: { light: string; dark: string };
}

export interface RehypeCodeOptions {
  /** `false` = tắt Shiki (code block giữ `<pre><code>` thô). */
  shiki?: ShikiOptions | false;
  lineNumbers?: boolean;
}

export const DEFAULT_SHIKI: ShikiOptions = { themes: { light: 'github-light', dark: 'github-dark' } };

/** Version của output pipeline code block — cache transform (DM-406) phải đưa vào key. */
export const CODE_PIPELINE_VERSION = 'shiki4-v1';

const HIGHLIGHT_RE = /\{((?:\d+(?:-\d+)?,?)+)\}/;

/** `{1,3-5}` → [1,3,4,5] (1-based, sort + dedupe), và meta còn lại đã bỏ phần `{…}`. */
export function parseHighlightLines(meta: string): { lines: number[]; rest: string } {
  const m = meta.match(HIGHLIGHT_RE);
  if (!m) return { lines: [], rest: meta.trim() };
  const set = new Set<number>();
  for (const part of m[1]!.split(',').filter(Boolean)) {
    const [a, b] = part.split('-').map(Number) as [number, number | undefined];
    const end = b ?? a;
    for (let n = Math.min(a, end); n <= Math.max(a, end); n++) if (n >= 1) set.add(n);
  }
  return { lines: [...set].sort((x, y) => x - y), rest: meta.replace(HIGHLIGHT_RE, '').trim() };
}

/** remark: tách `{1,3-5}` + `[title]` khỏi meta của fence, gắn vào hProperties (sống sót qua rehype-raw). */
export function remarkCodeMeta() {
  return (tree: any) => {
    visit(tree, 'code', (node: any) => {
      const meta = String(node.meta ?? '');
      if (!meta) return;
      const { lines, rest } = parseHighlightLines(meta);
      const title = rest.match(/\[([^\]]+)\]/)?.[1];
      const props: Record<string, string> = {};
      if (lines.length) props['data-highlight-lines'] = lines.join(',');
      if (title) props['data-title'] = title;
      if (Object.keys(props).length) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, ...props } };
      node.meta = rest || null;
    });
  };
}

const highlighters = new Map<string, Promise<Highlighter>>();

/** Một highlighter / bộ theme cho cả tiến trình; grammar nạp dần theo ngôn ngữ thật sự gặp (langs: 'auto'). */
function getHighlighter(opts: ShikiOptions): Promise<Highlighter> {
  const key = `${opts.themes.light}|${opts.themes.dark}`;
  let h = highlighters.get(key);
  if (!h) {
    h = createHighlighter({ themes: [opts.themes.light, opts.themes.dark], langs: [] });
    highlighters.set(key, h);
  }
  return h;
}

function textOf(node: any): string {
  let out = '';
  visit(node, 'text', (t: any) => { out += t.value; });
  return out;
}

function langOf(code: any): string | undefined {
  const cls = code.properties?.className;
  const list: string[] = Array.isArray(cls) ? cls.map(String) : typeof cls === 'string' ? cls.split(/\s+/) : [];
  return list.map((c) => /^language-(.+)$/.exec(c)?.[1]).find(Boolean);
}

function markLines(pre: any, highlight: Set<number>, lineNumbers: boolean): void {
  const code = pre.children?.find((c: any) => c.tagName === 'code');
  let n = 0;
  for (const child of code?.children ?? []) {
    if (child.type !== 'element' || child.tagName !== 'span') continue;
    const cls = String(child.properties?.class ?? child.properties?.className ?? '');
    if (!/\bline\b/.test(cls)) continue;
    n++;
    const classes = cls.split(/\s+/).filter(Boolean);
    if (highlight.has(n)) classes.push('highlighted');
    child.properties = { ...child.properties, class: classes.join(' ') };
    if (lineNumbers) child.properties['data-line'] = String(n);
  }
}

/**
 * rehype: `pre > code` → `<div class="dommief-code" data-lang>` (+ title) bọc `<pre class="shiki">` của Shiki.
 * Ngôn ngữ không có grammar (vd `mermaid`) → warning + giữ code thô, KHÔNG fail build (§8.1).
 * Fence không ghi lang → code thô (Shiki ném lỗi với lang rỗng, §3.16).
 */
export function rehypeCode(options: RehypeCodeOptions = {}) {
  const shiki = options.shiki === undefined ? DEFAULT_SHIKI : options.shiki;
  const lineNumbers = !!options.lineNumbers;
  return async (tree: any, file: any) => {
    const jobs: { parent: any; index: number; pre: any; code: any }[] = [];
    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (node.tagName !== 'pre' || !parent || typeof index !== 'number') return;
      const kids = (node.children ?? []).filter((c: any) => !(c.type === 'text' && !c.value.trim()));
      if (kids.length !== 1 || kids[0].tagName !== 'code') return;
      jobs.push({ parent, index, pre: node, code: kids[0] });
    });
    if (!jobs.length) return;
    const highlighter = shiki ? await getHighlighter(shiki) : null;
    for (const { parent, index, pre, code } of jobs) {
      const lang = langOf(code);
      const title = code.properties?.dataTitle as string | undefined;
      const hl = new Set(String(code.properties?.dataHighlightLines ?? '').split(',').filter(Boolean).map(Number));
      let inner: any = pre;
      if (highlighter && shiki && lang) {
        if (lang in bundledLanguages) {
          if (!highlighter.getLoadedLanguages().includes(lang)) await highlighter.loadLanguage(lang as any);
          const source = textOf(code).replace(/\n$/, '');
          const root: any = highlighter.codeToHast(source, { lang, themes: { light: shiki.themes.light, dark: shiki.themes.dark }, defaultColor: false });
          inner = root.children[0];
          markLines(inner, hl, lineNumbers);
        } else {
          const warnings: string[] = ((file.data ??= {}).warnings ??= []);
          const pos = pre.position?.start;
          warnings.push(`${file.path ?? ''}${pos ? `:${pos.line}` : ''} Shiki không có grammar cho "${lang}"; hiển thị code thô`);
        }
      }
      // Code thô vẫn mang highlight dòng được dưới dạng data-attr (theme không-Shiki tự CSS).
      if (inner === pre && hl.size) pre.properties = { ...pre.properties, 'data-highlight-lines': [...hl].join(',') };
      delete code.properties?.dataHighlightLines;
      delete code.properties?.dataTitle;
      const children: any[] = [];
      if (title) children.push({ type: 'element', tagName: 'div', properties: { className: ['dommief-code__title'] }, children: [{ type: 'text', value: title }] });
      children.push(inner);
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['dommief-code'], ...(lang ? { 'data-lang': lang } : {}) },
        children,
      };
    }
  };
}
