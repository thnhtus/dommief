import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'node:stream';
import { StaticRouter } from 'react-router';
import { createAppRoutes } from './AppRoutes.js';
import virtualRoutes from 'virtual:dommief/routes';
import virtualSite from 'virtual:dommief/site';
import { SiteProvider } from '../theme-api.js';

export { default as routes } from 'virtual:dommief/routes';

export function render(url: string): Promise<string> {
  const AppRoutes = createAppRoutes(virtualRoutes);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
    });
    writable.on('finish', () => resolve(Buffer.concat(chunks).toString()));
    writable.on('error', reject);
    const { pipe } = renderToPipeableStream(
      createElement(StaticRouter, { location: url }, createElement(SiteProvider, { value: virtualSite }, createElement(AppRoutes))),
      {
        onAllReady() { pipe(writable); },
        onError(err) { reject(err instanceof Error ? err : new Error(String(err))); },
      },
    );
  });
}
