import { afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSite } from './helpers/fixture-site.ts';

// DM-911: <link rel="alternate" hreflang> + x-default trong <head>.
const hreflangs = (html: string) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);

const withHost = createSite('html-i18n-host', {
  config: `export default { title: 'Fixture', sitemap: { hostname: 'https://site.com', exclude: [] }, locales: [{ id: 'en-US', name: 'English' }, { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' }] };\n`,
});
fs.writeFileSync(path.join(withHost.dir, 'docs', 'guide', 'getStarted.vi-VN.md'), '---\ntitle: Bắt đầu\n---\n\n# Bắt đầu\n');
fs.writeFileSync(path.join(withHost.dir, 'docs', 'only-en.md'), '# Only en\n');

const noHost = createSite('html-i18n-nohost', {
  config: `export default { title: 'Fixture', locales: [{ id: 'en-US', name: 'English' }, { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' }] };\n`,
});
fs.writeFileSync(path.join(noHost.dir, 'docs', 'guide', 'getStarted.vi-VN.md'), '# Bắt đầu\n');

describe('hreflang (DM-911)', () => {
  afterAll(() => { withHost.cleanup(); noHost.cleanup(); });

  it('reciprocal + x-default khi có hostname và đủ bản dịch', () => {
    withHost.build();
    const en = withHost.read('guide/get-started/index.html');
    const vi = fs.readFileSync(path.join(withHost.dist, 'vi-VN', 'guide', 'get-started', 'index.html'), 'utf8');
    const want = [
      ['en-US', 'https://site.com/guide/get-started'],
      ['vi-VN', 'https://site.com/vi-VN/guide/get-started'],
      ['x-default', 'https://site.com/guide/get-started'],
    ];
    expect(hreflangs(en)).toEqual(want);
    expect(hreflangs(vi)).toEqual(want);
  }, 180_000);

  it('trang chỉ có 1 bản: không phát hreflang', () => {
    expect(hreflangs(withHost.read('only-en/index.html'))).toEqual([]);
  });

  it('sitemap.xml khớp hreflang trong HTML (DM-912)', () => {
    const xml = withHost.read('sitemap.xml');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="vi-VN" href="https://site.com/vi-VN/guide/get-started"/>');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://site.com/guide/get-started"/>');
  });

  it('404 không phát hreflang', () => {
    expect(hreflangs(withHost.read('404.html'))).toEqual([]);
  });

  it('thiếu hostname: không phát hreflang, không fail build', () => {
    noHost.build();
    expect(hreflangs(noHost.read('guide/get-started/index.html'))).toEqual([]);
  }, 180_000);
});
