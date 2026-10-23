import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRouteTable, routeConfigHash } from '../packages/core/src/routes.ts';
import type { RouteConfig } from '../packages/core/src/types.ts';

const dirs: string[] = [];
function tree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dommief-routes-'));
  dirs.push(root);
  for (const f of files) {
    const p = join(root, f);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, '# x\n');
  }
  return root;
}
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const config: RouteConfig = {
  srcDir: 'docs',
  docDirs: [{ dir: 'docs' }],
  locales: [
    { id: 'en-US', name: 'English', base: '/', suffix: '' },
    { id: 'vi-VN', name: 'Tiếng Việt', base: '/vi/', suffix: '' },
  ],
  forceKebabCase: true,
  cleanUrls: true,
};

describe('RouteTable (DM-208)', () => {
  it('(a) byPath và byFile trỏ cùng một object route', () => {
    const cwd = tree(['docs/index.md', 'docs/guide/index.md', 'docs/guide/intro.md']);
    const t = buildRouteTable({ cwd, config });
    expect(t.routes).toHaveLength(3);
    const file = Object.keys(t.byFile).find((f) => f.endsWith('docs/guide/index.md'))!;
    expect(file.startsWith('/')).toBe(true);
    expect(t.byPath['/guide']).toBe(t.byFile[file]);
    expect(t.byId['guide/index']).toBe(t.byPath['/guide']);
  });

  it('(b) byId tra theo id có hậu tố locale, byPath theo path đã localize', () => {
    const cwd = tree(['docs/intro.md', 'docs/intro.vi-VN.md']);
    const t = buildRouteTable({ cwd, config });
    expect(t.byId['intro.vi-VN'].path).toBe('/vi/intro');
    expect(t.byPath['/vi/intro']).toBe(t.byId['intro.vi-VN']);
    expect(t.byPath['/vi/intro'].locale).toBe('vi-VN');
  });

  it('(c) routes sort tăng dần theo path, deterministic giữa 2 lần build', () => {
    const cwd = tree(['docs/z.md', 'docs/a/b.md', 'docs/index.md', 'docs/m.md', 'docs/A.vi-VN.md']);
    const t1 = buildRouteTable({ cwd, config });
    const t2 = buildRouteTable({ cwd, config });
    const paths = t1.routes.map((r) => r.path);
    expect(paths).toEqual([...paths].sort());
    expect(t2).toEqual(t1);
    expect(Object.keys(t1.byPath)).toEqual(paths);
  });

  it('(d) configHash đổi theo forceKebabCase, không đổi theo title; ổn định', () => {
    const h = routeConfigHash(config);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(routeConfigHash(config)).toBe(h);
    expect(routeConfigHash({ ...config, forceKebabCase: false })).not.toBe(h);
    expect(routeConfigHash({ ...config, cleanUrls: false })).not.toBe(h);
    expect(routeConfigHash({ ...config, srcDir: 'x' })).not.toBe(h);
    expect(routeConfigHash({ ...config, title: 'khác' } as RouteConfig)).toBe(h);
  });

  it('(e) path lạ -> undefined, không throw', () => {
    const t = buildRouteTable({ cwd: tree(['docs/a.md']), config });
    expect(t.byPath['/no-such']).toBeUndefined();
  });

  it('JSON-safe: round-trip deep-equal', () => {
    const cwd = tree(['docs/index.md', 'docs/intro.vi-VN.md', 'docs/guide/x.md']);
    const t = buildRouteTable({ cwd, config });
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });
});
