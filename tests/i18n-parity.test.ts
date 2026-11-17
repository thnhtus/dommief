import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createSite } from './helpers/fixture-site.ts';

describe('i18n parity (DM-916)', () => {
  it('site 2 locale thiếu bản dịch → warning gom nhóm', () => {
    const s = createSite('i18n-parity-warn', {
      config: `export default { title: 'Fixture', locales: [{ id: 'en-US', name: 'English' }, { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' }] };\n`,
    });
    fs.writeFileSync(path.join(s.dir, 'docs', 'guide', 'intro.vi-VN.md'), '# Giới thiệu\n');
    fs.writeFileSync(path.join(s.dir, 'docs', 'only-en.md'), '# Only en\n');
    // warning, không fail (requireParity mặc định false) — log.warn ra stderr
    const r = spawnSync('node', [path.join(process.cwd(), 'packages/core/dist/cli.js'), 'build'], { cwd: s.dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/Missing translations for \d+ keys/);
    s.cleanup();
  });

  it('requireParity: true → build throw i18n_parity', () => {
    const s = createSite('i18n-parity-fail', {
      config: `export default { title: 'Fixture', i18n: { requireParity: true }, locales: [{ id: 'en-US', name: 'English' }, { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' }] };\n`,
    });
    fs.writeFileSync(path.join(s.dir, 'docs', 'guide', 'intro.vi-VN.md'), '# Giới thiệu\n');
    fs.writeFileSync(path.join(s.dir, 'docs', 'only-en.md'), '# Only en\n');
    expect(() => s.build()).toThrow(/i18n_parity|Missing translations/);
    s.cleanup();
  });

  it('allowSingleLocale bỏ qua key pattern', () => {
    const s = createSite('i18n-parity-allow', {
      config: `export default { title: 'Fixture', i18n: { requireParity: true, allowSingleLocale: ['reference/**'] }, locales: [{ id: 'en-US', name: 'English' }, { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/' }] };\n`,
    });
    fs.mkdirSync(path.join(s.dir, 'docs', 'reference'), { recursive: true });
    fs.writeFileSync(path.join(s.dir, 'docs', 'reference', 'api.md'), '# API\n');
    fs.writeFileSync(path.join(s.dir, 'docs', 'guide', 'intro.md'), '# Intro\n');
    // Chỉ "reference/api" được bỏ qua; các key khác (guide/intro, /) vẫn thiếu vi-VN → vẫn có warning.
    // Ở đây kiểm tra trực tiếp: sau khi allowSingleLocale áp dụng, không còn key 'reference/api' trong danh sách lỗi.
    let msg = '';
    try { s.build(); } catch (e) { msg = String(e); }
    expect(msg).not.toContain('reference/api');
    s.cleanup();
  });
});
