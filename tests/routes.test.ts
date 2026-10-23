import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRouteTable, normalizeRoutes } from '../packages/core/src/routes.ts';
import type { ResolvedLocale, RouteConfig } from '../packages/core/src/types.ts';

// Ca đánh số [n] theo docs/spec/ROUTING.md §7. Cây file thật trong tmp dir (không mock fs).
const dirs: string[] = [];
function tree(files: string[], dirNames = ['docs']): string {
  const root = mkdtempSync(join(tmpdir(), 'dommief-routes-'));
  dirs.push(root);
  for (const d of dirNames) mkdirSync(join(root, d), { recursive: true });
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
const cfg = (over: Partial<RouteConfig> = {}): RouteConfig => ({
  srcDir: 'docs', docDirs: [{ dir: 'docs' }], locales: base, forceKebabCase: true, cleanUrls: true, ...over,
});
const one = (file: string, over: Partial<RouteConfig> = {}) => {
  const cwd = tree([`docs/${file}`]);
  const t = buildRouteTable({ cwd, config: cfg(over) });
  expect(t.routes).toHaveLength(1);
  return t;
};
const fail = (files: string[], over: Partial<RouteConfig> = {}) => {
  const cwd = tree(files, ['docs', 'guides']);
  try { buildRouteTable({ cwd, config: cfg(over) }); } catch (e) { return e as Error & { code?: string }; }
  throw new Error('expected buildRouteTable to throw');
};

describe('routes §7.1 mapping', () => {
  const cases: [number, string, string, string | undefined, string][] = [
    [1, 'index.md', '/', undefined, 'index'],
    [2, 'README.md', '/', undefined, 'README'],
    [3, 'guide/index.md', '/guide', undefined, 'guide/index'],
    [4, 'guide/README.md', '/guide', undefined, 'guide/README'],
    [5, 'guide/intro.md', '/guide/intro', undefined, 'guide/intro'],
    [6, 'guide/getStarted.md', '/guide/get-started', undefined, 'guide/getStarted'],
    [7, 'guide/FAQ.md', '/guide/faq', undefined, 'guide/FAQ'],
    [8, 'guide/APITable.md', '/guide/api-table', undefined, 'guide/APITable'],
    [10, 'guide/intro.vi-VN.md', '/vi-VN/guide/intro', 'vi-VN', 'guide/intro.vi-VN'],
    [11, 'index.vi-VN.md', '/vi-VN', 'vi-VN', 'index.vi-VN'],
    [12, 'guide/index.vi-VN.md', '/vi-VN/guide', 'vi-VN', 'guide/index.vi-VN'],
    [13, 'api.en-US.md', '/api', undefined, 'api.en-US'],
    [14, 'api.en.md', '/api/en', undefined, 'api.en'],
    [15, 'v1.2.md', '/v1/2', undefined, 'v1.2'],
    [17, 'Guide/Intro.md', '/guide/intro', undefined, 'Guide/Intro'],
    [18, 'guide/a/index.md', '/guide/a', undefined, 'guide/a/index'],
    [19, 'a_b.md', '/a_b', undefined, 'a_b'],
  ];
  for (const [n, file, p, locale, id] of cases) {
    it(`[${n}] ${file} -> ${p}`, () => {
      const [r] = one(file).routes;
      expect(r.path).toBe(p);
      expect(r.locale).toBe(locale);
      expect(r.id).toBe(id);
      expect(r.file).toMatch(/^\/.*docs\/.+\.md$/);
      expect(r.file).not.toContain('\\');
    });
  }

  it('[9] non-ASCII -> path NFC + warning', () => {
    const t = one('guide/ĐiềuHướng.md');
    expect(t.routes[0].path).toBe('/guide/điều-hướng');
    expect(t.routes[0].id).toBe('guide/ĐiềuHướng');
    expect(t.warnings.some((w) => w.includes('route_non_ascii'))).toBe(true);
  });

  it('[16] _draft, .hidden, node_modules, .mdx, .MD -> không sinh route', () => {
    const cwd = tree(['docs/_draft.md', 'docs/_wip/x.md', 'docs/.hidden/x.md', 'docs/node_modules/a.md', 'docs/note.mdx', 'docs/Up.MD']);
    const t = buildRouteTable({ cwd, config: cfg() });
    expect(t.routes).toHaveLength(0);
    expect(t.warnings).toEqual([]);
  });
});

describe('routes §7.2 errors', () => {
  it('[20] guide.md + guide/index.md', () => {
    const e = fail(['docs/guide.md', 'docs/guide/index.md']);
    expect(e.code).toBe('route_duplicate');
    expect(e.message).toContain('trùng đường dẫn "/guide"');
    expect(e.message).toContain('gộp vào thư mục');
    expect(e.message).toContain('docs/guide.md');
    expect(e.message).toContain('docs/guide/index.md');
  });
  it('[21] guide/index.md + guide/README.md', () => {
    const e = fail(['docs/guide/index.md', 'docs/guide/README.md']);
    expect(e.code).toBe('route_duplicate');
    expect(e.message).toContain('trùng đường dẫn "/guide"');
    expect(e.message).toContain('index.md');
    expect(e.message).toContain('README.md');
  });
  it('[22] getStarted.md + get-started.md', () => {
    const e = fail(['docs/getStarted.md', 'docs/get-started.md']);
    expect(e.message).toContain('trùng');
    expect(e.message).toContain('kebab-case');
  });
  it('[23] a.b.md + a/b.md', () => {
    const e = fail(['docs/a.b.md', 'docs/a/b.md']);
    expect(e.message).toContain('trùng');
    expect(e.message).toContain('"." trong tên file');
  });
  it('[24] api.md + api.en-US.md', () => {
    const e = fail(['docs/api.md', 'docs/api.en-US.md']);
    expect(e.message).toContain('trùng');
    expect(e.message).toContain('locale mặc định');
  });
  it('[25] Intro / intro (tầng normalize, object route — macOS không tạo được 2 file khác hoa/thường)', () => {
    const cwd = '/tmp/x';
    const raw = [
      { id: 'Intro', path: '/Intro', file: '/tmp/x/docs/Intro.md' },
      { id: 'intro', path: '/intro', file: '/tmp/x/docs/intro.md' },
    ];
    expect(() => normalizeRoutes(raw, { cwd, config: cfg() })).toThrow(/trùng sau khi kebab/);
    try { normalizeRoutes(raw, { cwd, config: cfg() }); } catch (e) { expect((e as { code?: string }).code).toBe('route_duplicate'); }
    // không mutate input
    expect(raw[0].path).toBe('/Intro');
  });
  it('[26] docs/intro.md + guides/intro.md -> trùng route id', () => {
    const e = fail(['docs/intro.md', 'guides/intro.md'], { docDirs: [{ dir: 'docs' }, { dir: 'guides' }] });
    expect(e.code).toBe('route_duplicate');
    expect(e.message).toContain('trùng route id "intro"');
    expect(e.message).toContain('docs/intro.md');
    expect(e.message).toContain('guides/intro.md');
  });
  it('[27] foo bar.md -> ký tự không hợp lệ " "', () => {
    const e = fail(['docs/foo bar.md']);
    expect(e.code).toBe('route_invalid_path');
    expect(e.message).toContain('ký tự không hợp lệ " "');
    expect(e.message).toContain('foo bar.md');
  });
  it('[28] guide/$tab-api.md -> ký tự không hợp lệ "$"', () => {
    const e = fail(['docs/guide/$tab-api.md']);
    expect(e.code).toBe('route_invalid_path');
    expect(e.message).toContain('ký tự không hợp lệ "$"');
  });
});

describe('routes §7.3 locale/config', () => {
  it('[29] suffix mode: guide/intro.md', () => {
    expect(one('guide/intro.md', { locales: suffixMode }).routes[0].path).toBe('/guide/intro');
  });
  it('[30] suffix mode: guide/intro.vi-VN.md -> /guide/intro.vi', () => {
    const [r] = one('guide/intro.vi-VN.md', { locales: suffixMode }).routes;
    expect(r.path).toBe('/guide/intro.vi');
    expect(r.locale).toBe('vi-VN');
  });
  it('[31] suffix mode: index.vi-VN.md -> /.vi', () => {
    expect(one('index.vi-VN.md', { locales: suffixMode }).routes[0].path).toBe('/.vi');
  });
  it('[32] forceKebabCase:false giữ nguyên', () => {
    expect(one('guide/getStarted.md', { forceKebabCase: false }).routes[0].path).toBe('/guide/getStarted');
  });
  it('[33] docDirs: [] -> 0 route, không lỗi', () => {
    const cwd = tree([]);
    const t = buildRouteTable({ cwd, config: cfg({ docDirs: [] }) });
    expect(t.routes).toHaveLength(0);
    expect(t.warnings).toEqual([]);
  });
  it('[34] 1 locale: mọi route locale undefined', () => {
    const cwd = tree(['docs/index.md', 'docs/guide/intro.md']);
    const t = buildRouteTable({ cwd, config: cfg({ locales: [{ id: 'vi-VN', name: 'Tiếng Việt', base: '/', suffix: '' }] }) });
    expect(t.routes.map((r) => r.path)).toEqual(['/', '/guide/intro']);
    expect(t.routes.every((r) => r.locale === undefined)).toBe(true);
  });
});

describe('routes extras (DM-202/204)', () => {
  it('doc_dir_missing -> [] + warning, không ném', () => {
    const t = buildRouteTable({ cwd: tree([]), config: cfg({ docDirs: [{ dir: 'missing' }] }) });
    expect(t.routes).toEqual([]);
    expect(t.warnings).toHaveLength(1);
    expect(t.warnings[0]).toContain('doc_dir_missing');
  });
  it('locale_unknown_suffix: intro.vi-vn.md -> warning, xử lý như file thường', () => {
    const t = one('intro.vi-vn.md');
    expect(t.warnings.some((w) => w.includes('locale_unknown_suffix'))).toBe(true);
    expect(t.routes[0].locale).toBeUndefined();
  });
  it('thư mục tên trùng locale id không phải locale: vi-VN/intro.md -> /vi-vn/intro', () => {
    const [r] = one('vi-VN/intro.md').routes;
    expect(r.locale).toBeUndefined();
    expect(r.path).toBe('/vi-vn/intro');
  });
  it('file trong 2 docDir lồng nhau -> chỉ 1 route + warning', () => {
    const cwd = tree(['docs/guide/a.md']);
    const t = buildRouteTable({ cwd, config: cfg({ docDirs: [{ dir: 'docs' }, { dir: 'docs/guide' }] }) });
    expect(t.routes).toHaveLength(1);
    expect(t.warnings.some((w) => w.includes('route_duplicate_file'))).toBe(true);
  });
  it('id tương đối theo docDir của nó', () => {
    const cwd = tree(['docs/a.md', 'guides/b.md'], ['docs', 'guides']);
    const t = buildRouteTable({ cwd, config: cfg({ docDirs: [{ dir: 'docs' }, { dir: 'guides' }] }) });
    expect(t.routes.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('routes §7.4 nav/sidebar (DM-702, Phase 7)', () => {
  for (let n = 35; n <= 42; n++) it.todo(`[${n}] nav/sidebar`);
});
