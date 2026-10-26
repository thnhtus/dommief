import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSite } from '../helpers/fixture-site.ts';

// Đặc tả: docs/backlog/DM-511.md + DM-803. Override MỘT slot (SearchBox) bằng cách chỉ tạo
// `.dommief/theme/slots/SearchBox/index.tsx` -> build thật phải dùng file đó, chứng minh Navbar
// import SearchBox qua bare specifier `dommief/theme/slots/SearchBox` (không phải relative path
// cứng tới theme-default) — nếu Navbar.tsx import tương đối, override này sẽ không có hiệu lực.
const s = createSite('override-search-box');

describe('override SearchBox qua .dommief/theme (DM-511 + DM-803)', () => {
  beforeAll(() => {
    const dir = path.join(s.dir, '.dommief', 'theme', 'slots', 'SearchBox');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.tsx'), "export default function SearchBox() { return 'OVERRIDE-SEARCHBOX-MARKER'; }\n");
    s.build();
  }, 180_000);
  afterAll(() => s.cleanup());

  it('override marker xuất hiện trong HTML, default role="search" không còn', () => {
    const html = s.read('index.html');
    expect(html).toContain('OVERRIDE-SEARCHBOX-MARKER');
    expect(html).not.toContain('role="search"');
  });

  it('không fork cả theme: Navbar/Sidebar/ColorSwitch vẫn render (default)', () => {
    const html = s.read('index.html');
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain('aria-label="Sidebar"');
    expect(html).toContain('aria-label="Đổi giao diện sáng/tối"');
  });
});
