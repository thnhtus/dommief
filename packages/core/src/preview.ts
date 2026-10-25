import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { preview as vitePreview, type PreviewServer, type Connect, type Plugin } from 'vite';
import { DommiefError } from './markdown/errors.js';

// Đặc tả: docs/backlog/DM-411.md. Dùng `vite preview` thật (không tự viết static server) + SPA
// fallback cho route bị `ssg.exclude` (shell không có `index.html` ĐÚNG NGHĨA — build.ts đã ghi
// shell = template, nên thực ra MỌI route đều có file; fallback ở đây chỉ cần khi route không có
// thư mục nào khớp, vd điều hướng client-side tới URL động chưa từng build).

export interface PreviewOptions {
  root: string;
  base: string;
  outDir: string;
  port?: number;
  host?: string | boolean;
  open?: boolean;
}

/** Kiểm outDir TRƯỚC khi nghe cổng — preview không tự build (phải nhanh, tất định, "xem đúng cái vừa build"). */
export function assertBuildOutput(outDir: string): void {
  const indexHtml = path.join(outDir, 'index.html');
  if (!fs.existsSync(outDir) || !fs.existsSync(indexHtml)) {
    throw new DommiefError(`không có build output ở "${outDir}". Chạy \`dommief build\` trước.`, { code: 'no_build_output', file: outDir });
  }
}

export async function startPreview(opts: PreviewOptions): Promise<PreviewServer> {
  assertBuildOutput(opts.outDir);
  const server = await vitePreview({
    root: opts.root,
    base: opts.base,
    preview: {
      ...(opts.port !== undefined ? { port: opts.port } : {}),
      ...(opts.host !== undefined ? { host: opts.host } : {}),
      ...(opts.open !== undefined ? { open: opts.open } : {}),
    },
    build: { outDir: opts.outDir },
    plugins: [spaFallbackPlugin(opts)],
  });
  return server;
}

/**
 * `configurePreviewServer` chỉ tồn tại trên `Plugin`, không phải trên `InlineConfig` trực tiếp
 * — phải khai qua `plugins: [...]`.
 *
 * Middleware được cài TRỰC TIẾP trong hook (pre-hook), KHÔNG qua hàm trả về (post-hook): Vite
 * preview có sẵn SPA fallback riêng (`htmlFallbackMiddleware`) chạy trước post-hook, và nó trả
 * `index.html` GỐC cho mọi URL không có dấu `/` cuối — đã bắt trực tiếp: `/sub/guide/get-started`
 * trả nội dung trang chủ trong khi `/sub/guide/get-started/` trả đúng trang. Static host thật
 * (Netlify, Cloudflare Pages, nginx try_files) đều phục vụ `<dir>/index.html` cho URL không dấu `/`,
 * nên preview phải làm đúng như vậy, nếu không người dùng sẽ thấy bug chỉ có ở preview.
 *
 * Thứ tự: file trùng route (`<rel>/index.html` hoặc `<rel>.html`) -> phục vụ file đó; asset
 * (không phải request HTML) -> để static handler của Vite lo; còn lại (URL client-only chưa build)
 * -> shell gốc để router client tự render.
 */
function spaFallbackPlugin(opts: PreviewOptions): Plugin {
  const shellPath = path.join(opts.outDir, 'index.html');
  const base = opts.base.replace(/\/$/, '');
  const serveHtml = (res: ServerResponse, file: string) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: 'dommief:preview-spa-fallback',
    configurePreviewServer(s) {
      s.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        // KHÔNG lọc theo header `Accept`: trong Node, `fetch()` mặc định gửi `Accept: */*`
        // (không phải `text/html` như trong trình duyệt), nên lọc theo header sẽ bỏ qua middleware
        // cho chính cách test (và nhiều HTTP client khác) gọi đến — đã bắt trực tiếp: với header
        // lọc, `fetch('/sub/guide/get-started')` trả nhầm trang chủ (Vite fallback thay vì middleware
        // này xử lý). Lọc theo đuôi file: bỏ qua request rõ ràng là asset (có đuôi khác .html).
        const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        if (req.method !== 'GET') return next();
        // Ngoài base: TỰ trả 404, KHÔNG `next()` — static handler của Vite (sirv) không biết về
        // `base`, nó phục vụ `index.html` ở gốc `outDir` cho BẤT KỲ path nào không khớp asset —
        // đã bắt trực tiếp: `next()` khi path ngoài base trả nhầm 200 + trang chủ (tiêu chí
        // §3: GET '/' với `base: '/sub/'` PHẢI không phải 200).
        if (base && urlPath !== base && !urlPath.startsWith(base + '/')) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        const rel = base ? urlPath.slice(base.length) || '/' : urlPath;
        // THử tìm file HTML khớp route TRƯỚC khi quyết định next(): heuristic đuôi file cũ
        // (`/\.[a-z0-9]+$/`) coi mọi segment cuối có dấu chấm là asset, nên route thật kiểu
        // `/guide/v1.2` hay `/api/node.js` bị rơi về static handler và nhận lại đúng bug
        // trailing-slash đã sửa (chưa thử khhớp đã kết luận là asset). Dùng `path.resolve`
        // (không phải so sánh chuỗi prefix) cho traversal guard: `/dist-evil` không được
        // qua chỉ vì cùng tiền tố ký tự với `outDir`.
        const outDirResolved = path.resolve(opts.outDir);
        const safe = (p: string) => {
          const r = path.resolve(p);
          return r === outDirResolved || r.startsWith(outDirResolved + path.sep);
        };
        const candidates = [
          path.join(opts.outDir, rel, 'index.html'),
          path.join(opts.outDir, rel.endsWith('.html') ? rel : rel.replace(/\/$/, '') + '.html'),
        ];
        const hit = candidates.find((p) => safe(p) && fs.existsSync(p) && fs.statSync(p).isFile());
        if (hit) return serveHtml(res, hit);
        // Không khớp HTML nào: request có đuôi file rõ ràng (asset thật, vd .js/.css/.png) ->
        // nhường static handler của Vite xử lý (404 thật nếu không tồn tại); còn lại -> shell
        // (SPA fallback cho URL client-only chưa build).
        if (/\.[a-z0-9]+$/i.test(rel.replace(/\.html$/i, ''))) return next();
        serveHtml(res, shellPath);
      });
    },
  };
}
