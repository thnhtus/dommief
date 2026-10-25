import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTheme, loadThemeManifest, resolveThemeRoot } from '../../packages/core/src/theme/loader.ts';

// Đặc tả: docs/backlog/DM-501.md "Tiêu chí chấp nhận"
const fixtures = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'fixtures');
const minimal = path.join(fixtures, 'theme-minimal');
const missingLayout = path.join(fixtures, 'theme-missing-layout');

describe('loadTheme (DM-501)', () => {
  it('(1) manifest đủ layouts/slots/locales, plugin null khi không có plugin.ts', () => {
    const m = loadThemeManifest(minimal, 'theme-minimal');
    expect(Object.keys(m.layouts).sort()).toEqual(['DemoLayout', 'DocLayout', 'GlobalLayout']);
    expect(m.slots.Footer).toMatch(/Footer\.tsx$/);
    expect(m.locales['en-US']).toMatch(/en-US\.json$/);
    expect(m.plugin).toBeNull();
  });

  it('(2) thiếu layouts/DocLayout → DommiefError theme_layout_missing kèm layout name', () => {
    try {
      loadThemeManifest(missingLayout, 'theme-missing-layout');
      expect.unreachable('phải throw');
    } catch (e: any) {
      expect(e.code).toBe('theme_layout_missing');
      expect(e.layout).toContain('DocLayout');
      expect(e.layout).toContain('DemoLayout');
    }
  });

  it('(3) theme package không tồn tại → theme_package_not_found, không ERR_MODULE_NOT_FOUND trần', () => {
    try {
      loadTheme({ cwd: fixtures, theme: 'dommief-theme-khong-ton-tai' });
      expect.unreachable('phải throw');
    } catch (e: any) {
      expect(e.code).toBe('theme_package_not_found');
      expect(e.constructor.name).toBe('DommiefError');
    }
  });

  it('(4) đường dẫn theme "../outside" (dạng path tường minh) → throw, không thoát cwd', () => {
    expect(() => resolveThemeRoot(minimal, '../outside')).toThrow(/theme/);
  });

  it('resolve theo tên package nguồn trong chính monorepo (dommief-theme-default) không bị chặn bởi theme_path_escape', () => {
    const root = resolveThemeRoot(fixtures, 'dommief-theme-default');
    expect(root).toMatch(/theme-default[\\/]src$/);
  });
});
