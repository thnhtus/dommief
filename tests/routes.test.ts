import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanRoutes } from '../packages/core/src/routes.ts';

const dirs: string[] = [];
function makeSite(files: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'dommief-'));
  const src = join(root, 'docs');
  mkdirSync(src, { recursive: true });
  for (const f of files) {
    const p = join(src, f);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, '# x\n');
  }
  dirs.push(root);
  return { root, src };
}
afterEach(() => { while (dirs.length) { const d = dirs.pop()!; rmSync(d, { recursive: true, force: true }); } });

const locales = [{ id: 'default' }, { id: 'zh-CN' }];

describe('scanRoutes', () => {
  it('maps index.md to /', () => {
    const { root } = makeSite(['index.md']);
    const r = scanRoutes(root, 'docs', locales);
    expect(r.map(x => x.path)).toEqual(['/']);
  });

  it('maps README.md to /', () => {
    const { root } = makeSite(['README.md']);
    const r = scanRoutes(root, 'docs', locales);
    expect(r.map(x => x.path)).toEqual(['/']);
  });

  it('maps nested index to directory', () => {
    const { root } = makeSite(['guide/index.md']);
    const r = scanRoutes(root, 'docs', locales);
    expect(r.map(x => x.path)).toEqual(['/guide']);
  });

  it('detects locale suffix', () => {
    const { root } = makeSite(['foo.md', 'foo.zh-CN.md']);
    const r = scanRoutes(root, 'docs', locales);
    const zh = r.find(x => x.locale === 'zh-CN');
    expect(zh?.path).toBe('/zh-CN/foo');
  });

  it('kebab-cases when requested', () => {
    const { root } = makeSite(['FooBar.md']);
    const r = scanRoutes(root, 'docs', locales, true);
    expect(r.map(x => x.path)).toEqual(['/foo-bar']);
  });

  it('throws on duplicate route', () => {
    const { root } = makeSite(['a.md', 'a/index.md']);
    expect(() => scanRoutes(root, 'docs', locales)).toThrow(/Duplicate route/);
  });

  it('returns [] for missing srcDir', () => {
    const root = mkdtempSync(join(tmpdir(), 'dommief-'));
    dirs.push(root);
    expect(scanRoutes(root, 'docs', locales)).toEqual([]);
  });
});
