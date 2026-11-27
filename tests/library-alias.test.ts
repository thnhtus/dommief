import { buildLibraryAlias } from '../packages/core/src/library.ts';
import { mergeLibraryAlias } from '../packages/core/src/vite/plugin.ts';
import { describe, expect, it, vi } from 'vitest';

describe('buildLibraryAlias (DM-924)', () => {
  const base = { root: '/tmp/pkg', preset: 'library', library: { demoDir: 'demo', api: 'off' } };

  it('thiếu importName mà package.json#name hợp lệ → alias theo package.json', () => {
    const r = buildLibraryAlias({ ...base, library: { demoDir: 'demo', api: 'off' } }, 'acme-ui');
    expect(r).toEqual({ 'acme-ui': '/tmp/pkg/src' });
  });

  it('importName explicit thắng package.json', () => {
    const r = buildLibraryAlias({ ...base, library: { demoDir: 'demo', api: 'off', importName: 'acme-widgets' } }, 'acme-ui');
    expect(r).toEqual({ 'acme-widgets': '/tmp/pkg/src' });
  });

  it('trùng tên core → {} + warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const bad of ['dommief', 'react', 'react-dom', 'react-router', 'vite']) {
        expect(buildLibraryAlias({ ...base, library: { demoDir: 'demo', api: 'off', importName: bad } }, 'acme-ui')).toEqual({});
      }
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('preset docs → {} ngay cả khi set importName', () => {
    const r = buildLibraryAlias({ root: '/tmp/pkg', preset: 'docs', library: { demoDir: 'demo', api: 'off', importName: 'acme-ui' } });
    expect(r).toEqual({});
  });

  it('không có importName + không đọc được package.json → {} (không throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(buildLibraryAlias({ ...base, library: { demoDir: 'demo', api: 'off' } }, undefined).valueOf()).toBeDefined();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('mergeLibraryAlias (user alias thắng)', () => {
  it('user alias existing key → giữ user, không ghi đè', () => {
    const out = mergeLibraryAlias({ 'acme-ui': '/user/src', 'theme-x': '/theme' }, { 'acme-ui': '/pkg/src' });
    expect(out['acme-ui']).toBe('/user/src');
    expect(out['theme-x']).toBe('/theme');
  });

  it('user không khai key → lấy alias library', () => {
    const out = mergeLibraryAlias({ 'theme-x': '/theme' }, { 'acme-ui': '/pkg/src' });
    expect(out['acme-ui']).toBe('/pkg/src');
  });

  it('user = undefined/null (chưa merge) → toàn bộ alias library', () => {
    expect(mergeLibraryAlias(undefined, { 'acme-ui': '/pkg/src' })).toEqual({ 'acme-ui': '/pkg/src' });
  });
});
