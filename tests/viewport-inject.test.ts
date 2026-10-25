import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSite } from './helpers/fixture-site.ts';

// build.ts chèn `<meta viewport>` mặc định khi index.html của người dùng không có; nếu đã có (kể cả
// giá trị khác) thì KHÔNG đè. Fixture mặc định (tests/fixtures/site/index.html) cố ý không khai viewport.
const withoutOwn = createSite('viewport-default');
const withOwn = createSite('viewport-own');
const OWN = '<meta name="viewport" content="width=1024">';

describe('build: <meta viewport> mặc định', () => {
  beforeAll(() => {
    fs.writeFileSync(`${withOwn.dir}/index.html`, `<!doctype html><html><head><meta charset="utf-8" />${OWN}</head><body><div id="root"></div></body></html>`);
    withoutOwn.build();
    withOwn.build();
  }, 180_000);
  afterAll(() => { withoutOwn.cleanup(); withOwn.cleanup(); });

  it('không khai -> chèn đúng một lần, cả trang prerender lẫn 404', () => {
    for (const f of ['index.html', 'guide/get-started/index.html', '404.html']) {
      const html = withoutOwn.read(f);
      expect(html.match(/name="viewport"/g), f).toHaveLength(1);
      expect(html, f).toContain('width=device-width, initial-scale=1');
    }
  });

  it('đã tự khai -> giữ nguyên, không chèn thêm', () => {
    for (const f of ['index.html', '404.html']) {
      const html = withOwn.read(f);
      expect(html.match(/name="viewport"/g), f).toHaveLength(1);
      expect(html, f).toContain(OWN);
    }
  });
});
