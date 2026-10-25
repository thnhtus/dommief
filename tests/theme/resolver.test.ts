import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadThemeChain, resolveSlot, buildAliasChain } from '../../packages/core/src/theme/resolver.ts';

// Đặc tả: docs/backlog/DM-502.md "Tiêu chí chấp nhận"
const fixtures = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'fixtures');

describe('resolveSlot / buildAliasChain (DM-502)', () => {
  it('(1) local > pkg > default theo thứ tự ưu tiên', () => {
    const chain = loadThemeChain(fixtures, { theme: 'dommief-theme-default' });
    // Không có .dommief/theme ở fixtures/ cấp này -> local null -> rơi về pkg (== fallback, cùng default).
    expect(chain.local).toBeNull();
    const footer = resolveSlot('Footer', 'slots', chain);
    expect(footer).toMatch(/theme-default[\\/]src[\\/]slots[\\/]Footer\.tsx$/);
  });

  it('(2) slot không tồn tại ở bất kỳ root nào → throw theme_slot_missing (không trả undefined)', () => {
    const chain = loadThemeChain(fixtures, { theme: 'dommief-theme-default' });
    try {
      resolveSlot('KhongTonTai', 'slots', chain);
      expect.unreachable('phải throw');
    } catch (e: any) {
      expect(e.code).toBe('theme_slot_missing');
    }
  });

  it('(3) alias trả về absolute path có extension', () => {
    const aliases = buildAliasChain(fixtures, { theme: 'dommief-theme-default' });
    const footer = aliases['dommief/theme/slots/Footer']!;
    expect(path.isAbsolute(footer)).toBe(true);
    expect(footer).toMatch(/\.(tsx?|jsx?)$/);
  });

  it('(4)+(5) override cục bộ thắng; xoá file thì quay về default (không cần restart — test lại gọi buildAliasChain)', () => {
    const tmpRoot = path.join(fixtures, 'tmp-local-theme-test');
    const localSlotDir = path.join(tmpRoot, '.dommief', 'theme', 'slots', 'Footer');
    fs.mkdirSync(localSlotDir, { recursive: true });
    fs.writeFileSync(path.join(localSlotDir, 'index.tsx'), 'export function Footer() { return "LOCAL-FOOTER-MARKER"; }\n');
    try {
      const aliasesWithOverride = buildAliasChain(tmpRoot, { theme: 'dommief-theme-default' });
      expect(aliasesWithOverride['dommief/theme/slots/Footer']).toContain('.dommief');

      fs.rmSync(path.join(tmpRoot, '.dommief'), { recursive: true, force: true });
      const aliasesAfterRemove = buildAliasChain(tmpRoot, { theme: 'dommief-theme-default' });
      expect(aliasesAfterRemove['dommief/theme/slots/Footer']).not.toContain('.dommief');
      expect(aliasesAfterRemove['dommief/theme/slots/Footer']).toMatch(/theme-default/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
