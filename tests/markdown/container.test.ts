import { describe, expect, it } from 'vitest';
import { transformMarkdown } from '../../packages/core/src/markdown/index.ts';

// Đặc tả: docs/spec/MARKDOWN.md §3.4, §5.1; backlog DM-703.
describe('container (:::info etc.)', () => {
  it('(1a) :::info -> div class dommief-container--info', async () => {
    const { code } = await transformMarkdown(':::info\nNoi dung.\n:::\n', 'c1.md');
    expect(code).toContain('dommief-container');
    expect(code).toContain('dommief-container--info');
  });

  it('(1b) :::warning -> class warning (role="note", không phải alert — xem comment nguồn)', async () => {
    const { code } = await transformMarkdown(':::warning\nCan than.\n:::\n', 'c2.md');
    expect(code).toContain('dommief-container--warning');
    expect(code).toContain('"note"');
  });

  it('(1c) tiêu đề tuỳ chọn qua {title="..."}', async () => {
    const { code } = await transformMarkdown(':::info{title="Chu y"}\nNoi dung.\n:::\n', 'c3.md');
    expect(code).toContain('Chu y');
    expect(code).toContain('dommief-container__title');
  });

  it('(1d) tên không hợp lệ → cảnh báo, render fallback (không crash)', async () => {
    const { code, warnings } = await transformMarkdown(':::ten-khong-hop-le\nX\n:::\n', 'c4.md');
    expect(code).toContain('export default');
    expect(warnings.some((w) => /container.*ten-khong-hop-le|container type/i.test(w))).toBe(true);
  });

  it('(2) container lồng trong list vẫn parse được', async () => {
    const src = '- item\n\n  :::success\n  OK\n  :::\n';
    const { code } = await transformMarkdown(src, 'c5.md');
    expect(code).toContain('dommief-container--success');
  });

  it('(3) không làm vỡ chữ thật có dấu ":" (chặn text/leaf directive nuốt chữ)', async () => {
    const { code } = await transformMarkdown('Gio hop luc 10:30 sang.\n', 'c6.md');
    expect(code).toContain('10:30');
  });
});
