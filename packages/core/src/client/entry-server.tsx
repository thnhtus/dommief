import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'node:stream';
import { StaticRouter } from 'react-router';
import { createAppRoutes } from './AppRoutes.js';
import virtualRoutes from 'virtual:dommief/routes';
import virtualSite from 'virtual:dommief/site';
import { SiteProvider } from '../theme-api.js';

export { default as routes } from 'virtual:dommief/routes';

/** `url` là path của route (không gồm base); StaticRouter cần URL đầy đủ + basename. */
export async function render(url: string): Promise<string> {
  // SSG phải nạp mọi trang trước: React.lazy chưa resolve thì renderToString throw / ra fallback.
  await Promise.all(virtualRoutes.map((r) => r.preload()));
  const AppRoutes = createAppRoutes(virtualRoutes);
  const basename = virtualSite.base.replace(/\/$/, '');
  const location = basename + (url === '/' && basename ? '' : url) || '/';
  return new Promise((resolve, reject) => {
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
}
