import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRouteTable } from '../packages/core/src/routes.ts';
import type { ResolvedLocale, RouteConfig } from '../packages/core/src/types.ts';

// DM-910: Route.key (locale-neutral) + alternates + RouteTable.byKey.
const dirs: string[] = [];
function tree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dommief-i18n-routes-'));
  dirs.push(root);
  mkdirSync(join(root, 'docs'), { recursive: true });
  for (const f of files) {
    const p = join(root, f);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, '# x\n');
  }
  return root;
}
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const base: ResolvedLocale[] = [
  { id: 'en-US', name: 'English', base: '/', suffix: '' },
  { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi-VN/', suffix: '' },
];
const suffixMode: ResolvedLocale[] = [
  { id: 'en-US', name: 'English', base: '/', suffix: '' },
  { id: 'vi-VN', name: 'Tiếng Việt', base: '/', suffix: '.vi' },
];
const cfg = (locales: ResolvedLocale[] = base): RouteConfig => ({
  srcDir: 'docs', docDirs: [{ dir: 'docs' }], locales, forceKebabCase: true,
});
const table = (files: string[], locales = base) => buildRouteTable({ cwd: tree(files), config: cfg(locales) });

describe('DM-910 key + alternates', () => {
  it('base mode: trang + index cùng key, alternates đủ 2 locale', () => {
    const t = table(['docs/index.md', 'docs/index.vi-VN.md', 'docs/guide/intro.md', 'docs/guide/intro.vi-VN.md', 'docs/guide/index.vi-VN.md']);
    const en = t.byPath['/guide/intro']!;
    const vi = t.byPath['/vi-VN/guide/intro']!;
    expect(en.key).toBe('guide/intro');
    expect(en.alternates).toEqual({ 'en-US': '/guide/intro', 'vi-VN': '/vi-VN/guide/intro' });
    expect(vi.key).toBe('guide/intro');
    expect(vi.alternates).toEqual(en.alternates);
    expect(t.byKey['guide/intro']!['vi-VN']!.path).toBe('/vi-VN/guide/intro');
    // index.md và index.vi-VN.md là root, key ''
    expect(t.byPath['/']!.key).toBe('');
    expect(t.byPath['/vi-VN']!.key).toBe('');
    expect(t.byPath['/']!.alternates).toEqual({ 'en-US': '/', 'vi-VN': '/vi-VN' });
    // guide/index.vi-VN.md (key 'guide') nhóm với guide/index.md nếu có; riêng nó vẫn 1 alternates
    expect(t.byPath['/vi-VN/guide']!.key).toBe('guide');
    expect(t.byPath['/vi-VN/guide']!.alternates).toEqual({ 'vi-VN': '/vi-VN/guide' });
  });

  it('suffix mode: URL giữ suffix nhưng key sạch', () => {
    const t = table(['docs/guide/intro.md', 'docs/guide/intro.vi-VN.md'], suffixMode);
    const vi = t.byPath['/guide/intro.vi']!;
    expect(vi.key).toBe('guide/intro');
    expect(vi.path).toBe('/guide/intro.vi');
    expect(vi.alternates).toEqual({ 'en-US': '/guide/intro', 'vi-VN': '/guide/intro.vi' });
    // Route.id KHÔNG đổi (backward compat)
    expect(vi.id).toBe('guide/intro.vi-VN');
  });

  it('3 locale: alternates đủ 3 khi đủ bản dịch', () => {
    const three: ResolvedLocale[] = [...base, { id: 'ja-JP', name: '日本語', base: '/ja-JP/', suffix: '' }];
    const t = table(['docs/a.md', 'docs/a.vi-VN.md', 'docs/a.ja-JP.md'], three);
    expect(t.byPath['/a']!.alternates).toEqual({ 'en-US': '/a', 'vi-VN': '/vi-VN/a', 'ja-JP': '/ja-JP/a' });
  });

  it('trang chỉ có 1 bản: alternates đúng 1 entry', () => {
    const t = table(['docs/only.md']);
    expect(t.byPath['/only']!.alternates).toEqual({ 'en-US': '/only' });
  });

  it('README.md gộp cùng key với index.md', () => {
    const t = table(['docs/index.md', 'docs/guide/README.vi-VN.md']);
    expect(t.byPath['/vi-VN/guide']!.key).toBe('guide');
  });

  it('trùng (key, locale) ⇒ trùng path ⇒ route_duplicate (đã có sẵn)', () => {
    expect(() => table(['docs/guide/index.vi-VN.md', 'docs/guide/README.vi-VN.md'])).toThrow(/route_duplicate|trùng/);
  });
});
