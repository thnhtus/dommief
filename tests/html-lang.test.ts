import { afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSite } from './helpers/fixture-site.ts';

// DM-808: `<html lang>` phải theo locale của route (WCAG 3.1.1).
const s = createSite('html-lang', {
  config: `export default { title: 'Fixture', locales: [{ id: 'en', name: 'English' }, { id: 'vi', name: 'Tiếng Việt', base: '/vi/' }] };\n`,
});

fs.writeFileSync(path.join(s.dir, 'docs', 'index.vi.md'), '---\ntitle: Trang chủ\n---\n\n# Trang chủ\n');

describe('html lang theo locale', () => {
  afterAll(() => s.cleanup());
  it('route vi có lang="vi", route en giữ lang mặc định', () => {
    s.build();
    const en = s.read('index.html');
    const vi = fs.readFileSync(path.join(s.dist, 'vi', 'index.html'), 'utf8');
    expect(en).toMatch(/<html[^>]*lang="en"/);
    expect(vi).toMatch(/<html[^>]*lang="vi"/);
  }, 180_000);
});
