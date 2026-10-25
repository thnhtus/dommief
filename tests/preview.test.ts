import fs from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { assertBuildOutput, startPreview } from '../packages/core/src/preview.ts';
import { createSite } from './helpers/fixture-site.ts';

// Đặc tả: docs/backlog/DM-411.md "Tiêu chí chấp nhận" #1(b,c,d,e), #2, #3.
// (a) matchExclude đã test riêng ở tests/exclude.test.ts.
// Dùng "draft-foo" thay vì "~demos/foo" (ví dụ trong backlog): tên file bắt đầu "~" bị
// routes.ts (chuẩn hoá path) chặn với lỗi "ký tự không hợp lệ" — không liên quan tới DM-411,
// nên không gõ cứng theo chữ ví dụ. Hành vi exclude kiểm là như nhau với bất kỳ pattern nào.
const s = createSite('preview');

describe('preview (DM-411)', () => {
  afterAll(() => s.cleanup());

  it('(e) outDir chưa có build -> throw no_build_output, KHÔNG tự build (thư mục vẫn rỗng)', async () => {
    expect(() => assertBuildOutput(s.dist)).toThrow();
    try { assertBuildOutput(s.dist); } catch (e: any) { expect(e.code).toBe('no_build_output'); }
    expect(fs.existsSync(s.dist)).toBe(false);
    await expect(startPreview({ root: s.dir, base: '/', outDir: s.dist, port: 0 })).rejects.toMatchObject({ code: 'no_build_output' });
  });

  it('(b) route bị ssg.exclude vẫn có index.html (shell), nhưng không chứa nội dung đã render', () => {
    fs.writeFileSync(s.dir + '/dommief.config.ts', "export default { title: 'Fixture', base: '/sub/', ssg: { exclude: ['/draft-foo'] } };\n");
    fs.writeFileSync(s.dir + '/docs/draft-foo.md', '# Draft foo\n\nKHONG-DUOC-XUAT-HIEN-O-SHELL\n');
    s.build();

    expect(fs.existsSync(s.dist + '/guide/get-started/index.html')).toBe(true);
    expect(s.read('guide/get-started/index.html')).toContain('Guide-marker');

    // Amendment 2026-10-22: route bị exclude VẪN được ghi file (shell = template rỗng, không
    // phải bỏ qua hoàn toàn — nếu không host không-SPA-fallback sẽ 404 ngay khi mở tab mới).
    expect(fs.existsSync(s.dist + '/draft-foo/index.html')).toBe(true);
    expect(s.read('draft-foo/index.html')).not.toContain('KHONG-DUOC-XUAT-HIEN-O-SHELL');
  }, 60_000);

  it('(c) route bị exclude vẫn có trong virtual:dommief/routes (client router phục vụ) — assert qua server bundle, không qua HTML', () => {
    const serverBundle = fs.readFileSync(s.dir + '/.dommief/server/server.mjs', 'utf8');
    expect(serverBundle).toMatch(/draft-foo/);
  });

  it('(d)+(§3) preview thật trên cổng ngẫu nhiên: route thường 200+nội dung, route exclude 200+shell, base đúng', async () => {
    const server = await startPreview({ root: s.dir, base: '/sub/', outDir: s.dist, port: 0 });
    try {
      // Dùng resolvedUrls của Vite, KHÔNG tự ghép `127.0.0.1:<port>`: server bind IPv6 (`::1`)
      // nên fetch IPv4 bị ECONNREFUSED (đã bắt trực tiếp khi chạy thật).
      const localUrl = server.resolvedUrls!.local[0]!; // vd http://localhost:56138/sub/
      const origin = new URL(localUrl).origin;

      const resReal = await fetch(`${origin}/sub/guide/get-started`);
      expect(resReal.status).toBe(200);
      expect(await resReal.text()).toContain('Guide-marker');

      const resExcluded = await fetch(`${origin}/sub/draft-foo`);
      expect(resExcluded.status).toBe(200);
      expect(await resExcluded.text()).not.toContain('KHONG-DUOC-XUAT-HIEN-O-SHELL');

      // URL chưa từng build: như static host thật — 404.html + status 404 (không phải shell trang chủ).
      const resMissing = await fetch(`${origin}/sub/khong-co-trang-nay`);
      expect(resMissing.status).toBe(404);
      expect(await resMissing.text()).toContain('<h1>404</h1>');

      // (§3) base '/sub/': GET '/sub/' -> 200; GET '/' -> không phải 200 HTML trang chủ.
      const resRoot = await fetch(`${origin}/sub/`);
      expect(resRoot.status).toBe(200);
      const resNoBase = await fetch(`${origin}/`);
      expect(resNoBase.status).not.toBe(200);
    } finally {
      await server.close();
    }
  }, 30_000);
});

// Dommief tự coi dấu chấm trong tên file là phân cách sub-route (routes.ts: `parts.flatMap((s)
// => s.split('.'))`), nên route build qua docDirs KHÔNG BAO GIỜ có dấu chấm trong path (vd
// "v1.2.md" -> "/guide/v1/2", không phải "/guide/v1.2" — đã thử trực tiếp). Nhưng middleware
// SPA fallback trong preview.ts là hạ tầng chung, không nên giả định điều đó (vd plugin khác
// có thể đăng ký route qua `modifyRoutes` với path có dấu chấm) — dựng thẳng `outDir` để
// kiểm độc lập với pipeline build.
describe('preview (DM-411) — route path có dấu chấm, dựng outDir tay', () => {
  it('thử khớp file HTML TRƯỚC khi coi là asset theo đuôi file', async () => {
    const s2 = createSite('preview-dotted');
    fs.writeFileSync(s2.dir + '/dommief.config.ts', "export default { title: 'Fixture' };\n");
    s2.build();
    fs.mkdirSync(s2.dist + '/guide/v1.2', { recursive: true });
    fs.writeFileSync(s2.dist + '/guide/v1.2/index.html', '<!doctype html><html><body>Dotted-route-marker</body></html>');
    const server = await startPreview({ root: s2.dir, base: '/', outDir: s2.dist, port: 0 });
    try {
      const origin = new URL(server.resolvedUrls!.local[0]!).origin;
      const res = await fetch(`${origin}/guide/v1.2`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Dotted-route-marker');
    } finally {
      await server.close();
      s2.cleanup();
    }
  }, 30_000);
});
