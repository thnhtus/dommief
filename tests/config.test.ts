import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defineConfig, loadConfigFile, resolveConfig, type UserConfig } from '../packages/core/src/config.ts';
import { DommiefError } from '../packages/core/src/markdown/errors.ts';

const cwd = '/tmp/dommief-config-test';
const resolve = (c: UserConfig, o: Partial<Parameters<typeof resolveConfig>[1]> = {}) => resolveConfig(c, { cwd, ...o });
const fail = (fn: () => unknown): DommiefError => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(DommiefError); return e as DommiefError; }
  throw new Error('expected config_invalid');
};

describe('resolveConfig', () => {
  it('(a) defaults without a config file', () => {
    const c = resolve({});
    expect(c).toMatchObject({ base: '/', srcDir: 'docs', docDirs: [{ dir: 'docs' }], outDir: 'dist', cleanUrls: true, forceKebabCase: true, root: cwd });
  });

  it('(b) base "sub" → config_invalid naming base and value', () => {
    const e = fail(() => resolve({ base: 'sub' }));
    expect(e.code).toBe('config_invalid');
    expect(e.message).toContain('base');
    expect(e.message).toContain("sub");
  });

  it('(c) base normalization is idempotent', () => {
    expect(resolve({ base: '/sub' }).base).toBe('/sub/');
    expect(resolve({ base: resolve({ base: '/sub' }).base }).base).toBe('/sub/');
    expect(resolve({ base: '/' }).base).toBe('/');
  });

  it('(d) srcDir → docDirs; explicit docDirs wins', () => {
    expect(resolve({ srcDir: 'content' }).docDirs).toEqual([{ dir: 'content' }]);
    expect(resolve({ srcDir: 'content', docDirs: ['a', { dir: 'b' }] }).docDirs).toEqual([{ dir: 'a' }, { dir: 'b' }]);
  });

  it('(e) locales resolve to full base + suffix', () => {
    const { locales } = resolve({ locales: [{ id: 'vi-VN', name: 'Tiếng Việt' }, { id: 'en-US', name: 'English', base: '/en/' }] });
    expect(locales).toEqual([
      { id: 'vi-VN', name: 'Tiếng Việt', base: '/', suffix: '' },
      { id: 'en-US', name: 'English', base: '/en/', suffix: '' },
    ]);
  });

  it('(f) second locale base "/" → error key locales[1].base', () => {
    const e = fail(() => resolve({ locales: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', base: '/' }] }));
    expect(e.code).toBe('config_invalid');
    expect(e.message).toContain('locales[1].base');
  });

  it('(g) mixing base and suffix → error key locales[1]', () => {
    const e = fail(() => resolve({ locales: [{ id: 'a', name: 'A', base: '/' }, { id: 'b', name: 'B', suffix: '.b' }] }));
    expect(e.message).toContain('locales[1]');
    expect(e.message).toContain('suffix');
  });

  it('(h) precedence default < file < CLI < env (env wins)', () => {
    const file = { base: '/file/' };
    const cli = { base: '/cli/' };
    const env = { DOMMIEF_BASE: '/env/' };
    expect(resolve(file, { cli, env }).base).toBe('/env/');
    expect(resolve(file, { cli }).base).toBe('/cli/');
    expect(resolve(file).base).toBe('/file/');
  });

  it('(i) unknown key titel → strict error with suggestion', () => {
    const e = fail(() => resolve({ titel: 'x' } as unknown as UserConfig));
    expect(e.message).toContain('titel');
    expect(e.message).toContain('"title"');
  });
});

describe('loadConfigFile', () => {
  it('loads the real fixture through Vite and resolves title', async () => {
    const dir = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/config-project');
    const file = await loadConfigFile({ cwd: dir });
    expect(file).not.toBeNull();
    const c = resolveConfig(file!.config, { cwd: dir, configFile: file!.path });
    expect(c.title).toBe('Fixture Site');
    expect(c.base).toBe('/fixture/');
  });
});

describe('defineConfig types', () => {
  it('accepts suffix locales and rejects non-string id (checked by tsc)', () => {
    expect(defineConfig({ locales: [{ id: 'en-US', name: 'English', suffix: '' }] }).locales).toHaveLength(1);
    // @ts-expect-error id must be a string
    defineConfig({ locales: [{ id: 1 }] });
  });
});
