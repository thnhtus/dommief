import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSite } from '../helpers/fixture-site.ts';

// Đặc tả: docs/backlog/DM-511.md. Override MỘT slot bằng cách chỉ tạo
// `.dommief/theme/slots/Footer/index.tsx` -> build thật phải dùng file đó, không fork cả theme.
const s = createSite('override-footer');

describe('override Footer qua .dommief/theme (DM-511)', () => {
  beforeAll(() => {
    const dir = path.join(s.dir, '.dommief', 'theme', 'slots', 'Footer');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.tsx'), "export default function Footer() { return 'OVERRIDE-FOOTER-MARKER'; }\n");
    s.build();
  }, 180_000);
  afterAll(() => s.cleanup());

  it('(1) override marker xuất hiện, default marker không', () => {
    const html = s.read('index.html');
    expect(html).toContain('OVERRIDE-FOOTER-MARKER');
    expect(html).not.toContain('>Dommief<');
  });

  it('không fork cả theme: Navbar/Sidebar vẫn render (default)', () => {
    const html = s.read('index.html');
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain('aria-label="Sidebar"');
  });

  it('override còn nguyên sau build (SSR không được xoá .dommief/theme)', () => {
    expect(fs.existsSync(path.join(s.dir, '.dommief', 'theme', 'slots', 'Footer', 'index.tsx'))).toBe(true);
  });
});
