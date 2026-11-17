import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSite } from '../helpers/fixture-site.ts';

// DM-915: link `.md` từ file locale L trỏ bản dịch L nếu có, ngược lại bản mặc định.
describe('markdown link i18n (DM-915)', () => {
  const s = createSite('md-link-i18n', {
    config: `export default { title: 'Fixture', locales: [{ id: 'en-US', name: 'English' }, { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' }] };\n`,
  });
  fs.writeFileSync(path.join(s.dir, 'docs', 'guide', 'intro.vi-VN.md'), '# Giới thiệu\n\n[Xem](./getStarted.md) và [rõ ràng](./getStarted.vi-VN.md) và [không có](../only-en.md)\n');
  fs.writeFileSync(path.join(s.dir, 'docs', 'guide', 'intro.md'), '# Intro\n\n[See](./getStarted.md)\n');
  fs.writeFileSync(path.join(s.dir, 'docs', 'guide', 'getStarted.vi-VN.md'), '# Bắt đầu\n');
  fs.writeFileSync(path.join(s.dir, 'docs', 'only-en.md'), '# Only en\n');

  it('trang vi: link tương đối trỏ bản vi, link tường minh giữ nguyên, thiếu bản dịch về mặc định', () => {
    s.build();
    const vi = s.read('vi-VN/guide/intro/index.html');
    expect(vi).toContain('href="/vi-VN/guide/get-started"');
    // link tường minh tới file đã có hậu tố: route của nó là bản vi → path vi (không đổi)
    expect(vi).toMatch(/href="\/vi-VN\/guide\/get-started"[^>]*>rõ ràng/);
    expect(vi).toContain('href="/only-en"'); // thiếu bản vi → mặc định
    const en = s.read('guide/intro/index.html');
    expect(en).toContain('href="/guide/get-started"');
    s.cleanup();
  }, 180_000);
});
