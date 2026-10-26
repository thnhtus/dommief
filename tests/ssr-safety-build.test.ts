import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSite } from './helpers/fixture-site.ts';

// Đặc tả: docs/backlog/DM-408.md "Tiêu chí chấp nhận" #3.
// e2e thật: một slot theme override đọc `window` trong render -> `dommief build` exit != 0, stderr có
// `ssr_unsafe_access`. (Không dùng ```jsx demo: DumiDemo hiện chỉ in mã nguồn, không thực thi component,
// nên đọc window trong demo không bao giờ chạy lúc SSR — slot override là nơi thật sự render.)
const s = createSite('ssr-safety-build');

function writeFooter(body: string) {
  const dir = path.join(s.dir, '.dommief', 'theme', 'slots', 'Footer');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.tsx'), body);
}

describe('dommief build + ssr-guard thật (DM-408 §3)', () => {
  afterAll(() => s.cleanup());

  it('slot đọc window.innerWidth trong render -> exit != 0 với ssr_unsafe_access', () => {
    writeFooter("export default function Footer() { return <footer>{window.innerWidth}</footer>; }\n");
    let output = '';
    try { s.build(); } catch (e: any) { output = String(e.stderr ?? '') + String(e.stdout ?? ''); }
    expect(output).toMatch(/ssr_unsafe_access/);
  }, 60_000);

  it('cùng slot bọc <ClientOnly> -> build thành công, HTML tĩnh không chứa giá trị window', () => {
    writeFooter(
      "import { ClientOnly } from 'dommief/theme-api';\n" +
      "export default function Footer() { return <footer><ClientOnly fallback={<span>FALLBACK-MARK</span>}><Inner /></ClientOnly></footer>; }\n" +
      "function Inner() { return <span>{window.innerWidth}</span>; }\n",
    );
    s.build();
    const html = s.read('index.html');
    expect(html).toContain('FALLBACK-MARK');
  }, 60_000);
});
