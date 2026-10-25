import { describe, expect, it } from 'vitest';
import { transformMarkdown } from '../../packages/core/src/markdown/index.ts';

// Đặc tả: docs/spec/MARKDOWN.md §8; backlog DM-706. Shiki chạy build-time, HTML gửi xuống client
// tĩnh, không highlighter trong bundle.
const SHIKI_OPTS = { shiki: { themes: { light: 'github-light', dark: 'github-dark' } } as const };

describe('rehypeCode + Shiki (DM-706)', () => {
  it('(1a) highlight JS/TS: class shiki + biến CSS 2 màu, không color/background-color trực tiếp', async () => {
    const { code } = await transformMarkdown('```ts\nconst a = 1;\n```\n', 's1.md', { code: SHIKI_OPTS });
    expect(code).toContain('shiki shiki-themes github-light github-dark');
    expect(code).toContain('--shiki-light');
    expect(code).toContain('--shiki-dark');
    expect(code).not.toMatch(/"color":|"backgroundColor":/);
  }, 20_000);

  it('(1b) ngôn ngữ không hỗ trợ (shiki không có grammar) -> fallback code thô + warning, không fail build', async () => {
    const { code, warnings } = await transformMarkdown('```khong-ton-tai\nx\n```\n', 's2.md', { code: SHIKI_OPTS });
    expect(code).toContain('export default');
    expect(code).not.toContain('shiki-themes');
    expect(warnings.some((w) => /grammar|kh[oô]ng h[oỗ] tr[ợo]/i.test(w))).toBe(true);
  }, 20_000);

  it('(1c) output chứa CSS variables (đã assert ở 1a) + pre có tabindex="0" để cuộn bàn phím', async () => {
    const { code } = await transformMarkdown('```js\nconsole.log(1)\n```\n', 's3.md', { code: SHIKI_OPTS });
    expect(code).toContain('tabIndex="0"');
  }, 20_000);

  it('(1d) determinism: chạy 2 lần cho cùng input ra cùng output', async () => {
    const src = '```ts\nconst x: number = 1;\n```\n';
    const a = await transformMarkdown(src, 's4.md', { code: SHIKI_OPTS });
    const b = await transformMarkdown(src, 's4.md', { code: SHIKI_OPTS });
    expect(a.code).toBe(b.code);
  }, 20_000);

  it('(1e) không chứa <script>', async () => {
    const { code } = await transformMarkdown('```js\nconst a = 1;\n```\n', 's5.md', { code: SHIKI_OPTS });
    expect(code).not.toMatch(/<script/i);
  }, 20_000);

  it('(2) mỗi dòng là span.line, nối nhau bằng text node "\\n" (không phải <br>)', async () => {
    const { code } = await transformMarkdown('```js\nconst a=1\nconst b=2\n```\n', 's6.md', { code: SHIKI_OPTS });
    expect(code).toContain('className="line"');
    expect(code).toContain('{"\\n"}');
    expect(code).not.toContain('<br');
  }, 20_000);

  it('shiki: false -> giữ <pre><code> thô, không gọi Shiki', async () => {
    const { code } = await transformMarkdown('```js\nconst a = 1;\n```\n', 's7.md', { code: { shiki: false } });
    expect(code).not.toContain('shiki-themes');
    expect(code).toContain('language-js');
  });

  it('fence không ghi lang: giữ code thô dù Shiki bật (không truyền lang rỗng cho Shiki)', async () => {
    const { code } = await transformMarkdown('```\nplain text\n```\n', 's8.md', { code: SHIKI_OPTS });
    expect(code).not.toContain('shiki-themes');
  }, 20_000);
});
