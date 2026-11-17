import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSite } from './helpers/fixture-site.ts';

// DM-914: LangSwitch dùng `alternates` của route và `home()` của locale; kiểm trên HTML build thật.
describe('LangSwitch (DM-914)', () => {
  const s = createSite('lang-switch', {
    config: `export default { title: 'Fixture', locales: [{ id: 'en-US', name: 'English' }, { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' }] };\n`,
  });
    fs.writeFileSync(path.join(s.dir, 'docs', 'guide', 'getStarted.vi-VN.md'), '# Bắt đầu\n');
  fs.writeFileSync(path.join(s.dir, 'docs', 'only-en.md'), '# Only en\n');

  it('trang có bản dịch: link vi-VN tới bản dịch; trang không có: về trang chủ vi-VN', () => {
    s.build();
    const en = s.read('guide/get-started/index.html');
    expect(en).toContain('<a href="/vi-VN/guide/get-started" hrefLang="vi-VN" lang="vi-VN"');
    const onlyEn = s.read('only-en/index.html');
    expect(onlyEn).not.toContain('hrefLang="vi-VN"'); // không có locale vi-VN nào (chưa có trang chủ vi): không render link chết
    expect(onlyEn).toContain('aria-current="true"');
    s.cleanup();
  }, 180_000);

  it('site 1 locale: không render LangSwitch', () => {
    const one = createSite('lang-switch-one');
    one.build();
    expect(one.read('index.html')).not.toContain('hrefLang=');
    one.cleanup();
  }, 180_000);
});
