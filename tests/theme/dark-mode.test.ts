import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSite } from '../helpers/fixture-site.ts';

// Đặc tả: THEME-API §9.2 Amendment 2026-10-22 #1 + DM-510. Giá trị mặc định PHẢI tới từ SSR
// (<html>), không chỉ từ inline script chạy sau khi tải JS.
const s = createSite('dark-mode', {
  config: "export default { title: 'Fixture', base: '/sub/', themeConfig: { prefersColor: { default: 'dark' } } };\n",
});

describe('dark mode SSR (DM-510, THEME-API §9.2 Amendment #1)', () => {
  beforeAll(() => { s.build(); }, 180_000);
  afterAll(() => s.cleanup());

  it('(1) data-prefers-color="dark" nằm sẵn trong HTML tĩnh (không phụ thuộc JS)', () => {
    expect(s.read('index.html')).toMatch(/<html[^>]*data-prefers-color="dark"/);
  });

  it('(2) inline script < 1KB, không async/defer', () => {
    const html = s.read('index.html');
    const m = html.match(/<script>(\(function[^]*?)<\/script>/);
    expect(m).not.toBeNull();
    expect(m![1]!.length).toBeLessThan(1024);
    expect(html).not.toMatch(/<script[^>]*(async|defer)[^>]*>\(function/);
  });
});
