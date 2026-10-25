import { describe, expect, it } from 'vitest';
import { parseHighlightLines } from '../../packages/core/src/markdown/rehype-code.ts';
import { transformMarkdown } from '../../packages/core/src/markdown/index.ts';

// Đặc tả: docs/spec/MARKDOWN.md §3.8, §5.3; backlog DM-705.
describe('parseHighlightLines', () => {
  it('{1,3-5} -> [1,3,4,5], meta còn lại rỗng', () => {
    expect(parseHighlightLines('{1,3-5}')).toEqual({ lines: [1, 3, 4, 5], rest: '' });
  });
  it('range ngoài phạm vi (0, số âm) bị bỏ', () => {
    expect(parseHighlightLines('{0,2}').lines).toEqual([2]);
  });
  it('meta rỗng không đổi output', () => {
    expect(parseHighlightLines('')).toEqual({ lines: [], rest: '' });
  });
  it('meta không có {...} không đổi (giữ nguyên rest)', () => {
    expect(parseHighlightLines('[npm] pure')).toEqual({ lines: [], rest: '[npm] pure' });
  });
  it('deterministic: gọi 2 lần ra cùng kết quả', () => {
    expect(parseHighlightLines('{3,1,2}')).toEqual(parseHighlightLines('{1-3}'));
  });
});

describe('highlight dòng xuyên suốt pipeline (Shiki tắt, chỉ kiểm data-attr)', () => {
  it('fence {1,3} -> class highlighted đúng dòng 1 và 3, không dòng 2', async () => {
    const src = '```js {1,3}\nconst a=1\nconst b=2\nconst c=3\n```\n';
    const { code } = await transformMarkdown(src, 'hl.md', { code: { shiki: false } });
    // Shiki tắt: pipeline gắn highlight lines vào <pre data-highlight-lines>.
    expect(code).toMatch(/data-highlight-lines/);
    expect(code).toContain('"1,3"');
  });

  it('fence không có {...} -> không có data-highlight-lines', async () => {
    const src = '```js\nconst a=1\n```\n';
    const { code } = await transformMarkdown(src, 'nohl.md', { code: { shiki: false } });
    expect(code).not.toMatch(/data-highlight-lines/);
  });
});
