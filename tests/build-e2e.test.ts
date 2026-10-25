import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSite } from './helpers/fixture-site.ts';

// Chạy `dommief build` thật trên fixture: bắt các lỗi mà test hàm lẻ không thấy
// (entry không resolve, HTML trần không có script, trang crash vì thiếu import, base sai).
const s = createSite('build-e2e');
const dist = s.dist;
const read = s.read;

describe('dommief build (fixture site, base /sub/)', () => {
  beforeAll(() => { s.build(); }, 180_000);
  afterAll(() => s.cleanup());

  it('ghi trang lồng nhau theo kebab-case + 404.html', () => {
    expect(fs.existsSync(path.join(dist, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'guide/get-started/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(dist, '404.html'))).toBe(true);
  });

  it('mỗi trang có script module (base /sub/) và nội dung prerender', () => {
    for (const [file, marker] of [['index.html', 'Welcome-marker'], ['guide/get-started/index.html', 'Guide-marker'], ['404.html', '404']] as const) {
      const html = read(file);
      expect(html, file).toMatch(/<script type="module"[^>]*src="\/sub\/assets\//);
      expect(html, file).toContain(marker);
      expect(html, file).toContain('<div id="root">');
    }
  });

  it('code block tsx thường là code; ```tsx demo thành DumiDemo, không crash', () => {
    const html = read('guide/get-started/index.html');
    expect(html).toContain('plain-code-marker');
    expect(html).toContain('dommief-demo');
  });

  it('link .md thành path route thật (kebab-case, theo vị trí file), kèm basename', () => {
    expect(read('index.html')).toContain('href="/sub/guide/get-started"');
    expect(read('guide/get-started/index.html')).toContain('href="/sub/"');
  });

  it('ảnh tương đối được bundle thành asset có băm tên, dưới base', () => {
    const html = read('guide/get-started/index.html');
    expect(html).toMatch(/<img src="\/sub\/assets\/logo-[\w-]+\.svg"/);
    expect(fs.readdirSync(path.join(dist, 'assets')).some((f) => /^logo-.*\.svg$/.test(f))).toBe(true);
  });
});
