import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'node:stream';
import { StaticRouter } from 'react-router';
import { createAppRoutes } from './AppRoutes.js';
import virtualRoutes from 'virtual:dommief/routes';
import virtualSite from 'virtual:dommief/site';
import { SiteProvider } from '../theme-api.js';
import { withSsrGuard } from '../ssr-guard.js';

export { default as routes } from 'virtual:dommief/routes';
// DM-410: build.ts đọc `site.meta[routeId].toc` để kiểm anchor mà không phải tự parse lại HTML.
export { default as site } from 'virtual:dommief/site';

/**
 * `url` là path của route (không gồm base); StaticRouter cần URL đầy đủ + basename.
 *
 * DM-408: bọc mỗi lần gọi trong `withSsrGuard` (cài getter chặn `window`/`document`, gỡ trong
 * `finally`) — KHÔNG phải bọc quanh cả lô `mapLimit` trong build.ts: nếu nhiều route render
 * SONG SONG (`config.ssg.concurrency > 1`), mỗi lần gọi `render()` vẫn phải tự có guard riêng
 * để route này throw không làm mất guard của route khác đang chạy cùng lúc (cả hai dùng
 * chung 1 `globalThis`). Tiêu chí chấp nhận (c): route lỗi rồi gọi lại `render()` trên trang
 * sạch phải thành công — `uninstall()` trong `finally` đảm bảo điều này.
 */
export async function render(url: string): Promise<string> {
  return withSsrGuard(async () => {
    // SSG phải nạp mọi trang trước: React.lazy chưa resolve thì renderToString throw / ra fallback.
    await Promise.all(virtualRoutes.map((r) => r.preload()));
    const AppRoutes = createAppRoutes(virtualRoutes);
    const basename = virtualSite.base.replace(/\/$/, '');
    const location = basename + (url === '/' && basename ? '' : url) || '/';
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const writable = new Writable({
        write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
      });
      writable.on('finish', () => resolve(Buffer.concat(chunks).toString()));
      writable.on('error', reject);
      const { pipe } = renderToPipeableStream(
        createElement(
          StaticRouter,
          { location, basename: basename || '/' },
          createElement(SiteProvider, { value: virtualSite }, createElement(AppRoutes)),
        ),
        {
          onAllReady() { pipe(writable); },
          onError(err) { reject(err instanceof Error ? err : new Error(String(err))); },
        },
      );
    });
  });
}
