import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSiteModule } from '../packages/core/src/siteModule.ts';
import { buildLocaleMessages, type ThemeChain } from '../packages/core/src/theme/resolver.ts';
import { createSite } from './helpers/fixture-site.ts';

const chain = (dir: string): ThemeChain => ({
  local: {
    name: 'local', root: dir, builtins: {}, slots: {}, layouts: {},
    locales: { 'vi-VN': path.join(dir, 'vi-VN.json') }, plugin: null,
  },
  pkg: {
    name: 'pkg', root: dir, builtins: {}, slots: {}, layouts: {},
    locales: { 'en-US': path.join(dir, 'en.json'), 'vi-VN': path.join(dir, 'pkg-vi.json') }, plugin: null,
  },
  fallback: null,
});

describe('theme messages (DM-913)', () => {
  it('merge: local > pkg > default; key thiếu rơi về en-US', () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-msg-'));
    fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify({ a: 'A', b: 'B' }));
    fs.writeFileSync(path.join(dir, 'pkg-vi.json'), JSON.stringify({ a: 'A-vi' }));
    fs.writeFileSync(path.join(dir, 'vi-VN.json'), JSON.stringify({ b: 'B-local' }));
    const msgs = buildLocaleMessages(chain(dir), [{ id: 'en-US' }, { id: 'vi-VN' }]);
    expect(msgs['vi-VN']).toEqual({ a: 'A-vi', b: 'B-local' });
    expect(msgs['en-US']).toEqual({ a: 'A', b: 'B' });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('createSiteModule nhúng messages', () => {
    const code = createSiteModule({
      routes: [], meta: {},
      config: { base: '/', title: 'T', locales: [{ id: 'en-US', name: 'English', base: '/', suffix: '' }], messages: { 'en-US': { 'search.box': 'Search' } } },
    } as any);
    expect(code).toContain('"messages":{"en-US":{"search.box":"Search"}}');
  });

  it('build: trang en-US hiện chuỗi en, vi-VN hiện chuỗi vi', () => {
    const s = createSite('theme-i18n');
    fs.writeFileSync(s.dir + '/dommief.config.ts', "export default { title: 'Fixture', locales: [{ id: 'en-US', name: 'English' }, { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' }] };\n");
    fs.writeFileSync(s.dir + '/docs/guide/getStarted.vi-VN.md', '# Bắt đầu\n');
    s.build();
    const en = fs.readFileSync(path.join(s.dist, 'guide/get-started/index.html'), 'utf8');
    const vi = fs.readFileSync(path.join(s.dist, 'vi-VN/guide/get-started/index.html'), 'utf8');
    expect(en).toContain('Skip to navigation');
    expect(en).toContain('Search…');
    expect(vi).toContain('Bỏ qua điều hướng');
    expect(vi).toContain('Tìm kiếm…');
    s.cleanup();
  }, 180_000);
});
