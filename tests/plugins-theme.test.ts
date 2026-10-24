import { describe, expect, it } from 'vitest';
import { createPluginHost } from '../packages/core/src/plugins.ts';
import { paginate } from '../packages/core/src/siteFeatures.ts';
import { localeIdFor } from '../packages/core/src/theme-api.tsx';
import type { SiteData } from '../packages/core/src/types.ts';

describe('plugins (#10)', () => {
  it('setup + onBuildEnd cùng tồn tại', () => {
    const host = createPluginHost([{ setup: () => {}, onBuildEnd: () => {} }]);
    expect(host.onBuildEnd.taps).toHaveLength(1);
  });
  it('setup async → ném lỗi có tên', () => {
    expect(() => createPluginHost([async () => {}])).toThrow(/đồng bộ/);
  });
});

describe('paginate (#16)', () => {
  const routes = [
    { id: 'a', path: '/a', file: 'a' },
    { id: 'z', path: '/z', file: 'z' },
    { id: 'vi/a', path: '/vi/a', file: 'va', locale: 'vi-VN' },
  ];
  it('không nhảy sang locale khác', () => {
    expect(paginate(routes, '/z').next).toBeUndefined();
    expect(paginate(routes, '/a').next?.path).toBe('/z');
    expect(paginate(routes, '/vi/a')).toEqual({});
  });
});

describe('localeIdFor (#9)', () => {
  const site = {
    locales: [{ id: 'en-US', name: 'E', base: '/', suffix: '' }, { id: 'vi-VN', name: 'V', base: '/vi/', suffix: '' }],
    routes: { x: { id: 'x', path: '/vi/x', file: 'x', locale: 'vi-VN' }, y: { id: 'y', path: '/y', file: 'y' } },
  } as unknown as SiteData;
  it('theo route, và theo base cho 404', () => {
    expect(localeIdFor(site, '/vi/x')).toBe('vi-VN');
    expect(localeIdFor(site, '/y')).toBe('en-US');
    expect(localeIdFor(site, '/vi/khong-co')).toBe('vi-VN');
    expect(localeIdFor(site, '/khong-co')).toBe('en-US');
  });
});
