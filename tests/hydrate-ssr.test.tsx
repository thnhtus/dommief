import { JSDOM } from 'jsdom';
import { lazy } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { MemoryRouter, StaticRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { createRouteModule, type RouteModule } from '../packages/core/src/routesModule.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });

vi.mock('virtual:dommief/routes', () => ({ default: [] }));
vi.mock('virtual:dommief/site', () => ({ default: { base: '/', title: 't', locales: [], themeConfig: {}, routes: {}, meta: {}, nav: {}, sidebar: {} } }));
const { createAppRoutes } = await import('../packages/core/src/client/AppRoutes.tsx');

function page(id: string, path: string, text: string): RouteModule {
  const Comp = () => <p>{text}</p>;
  return createRouteModule(lazy, id, path, () => Promise.resolve({ default: Comp }));
}

describe('hydrate ssr', () => {
  it('preloaded route hydrates cleanly', async () => {
    const routes = [page('guide/intro', '/guide/intro', 'INTRO-PAGE')];
    await Promise.all(routes.map(r => r.preload()));
    const AppRoutes = createAppRoutes(routes);
    const html = renderToString(<StaticRouter location="/guide/intro"><AppRoutes /></StaticRouter>);
    const container = document.createElement('div');
    container.appendChild(document.createRange().createContextualFragment(html));
    document.body.appendChild(container);
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);
    hydrateRoot(container, <MemoryRouter initialEntries={['/guide/intro']}><AppRoutes /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 30));
    console.error = orig;
    expect(container.textContent).toContain('INTRO-PAGE');
    expect(errors.join('\n')).not.toMatch(/hydrat/i);
  });
});

  it('unpreloaded route: SSR empty fallback, preload then hydrate cleanly', async () => {
    const routes = [page('guide/x', '/guide/x', 'X-PAGE')];
    const AppRoutesServer = createAppRoutes(routes);
    const html = renderToString(<StaticRouter location="/guide/x"><AppRoutesServer /></StaticRouter>);
    expect(html).not.toContain('X-PAGE');
    await Promise.all(routes.map(r => r.preload()));
    const container = document.createElement('div');
    container.appendChild(document.createRange().createContextualFragment(html));
    document.body.appendChild(container);
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);
    const AppRoutesClient = createAppRoutes(routes);
    hydrateRoot(container, <MemoryRouter initialEntries={['/guide/x']}><AppRoutesClient /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 30));
    console.error = orig;
    expect(container.textContent).toContain('X-PAGE');
    expect(errors.join('\n')).not.toMatch(/hydrat/i);
  });

  it('unknown path hydrates 404 cleanly', async () => {
    const routes = [page('index', '/', 'INDEX-PAGE')];
    await Promise.all(routes.map(r => r.preload()));
    const AppRoutes = createAppRoutes(routes);
    const html = renderToString(<StaticRouter location="/khong-co"><AppRoutes /></StaticRouter>);
    const container = document.createElement('div');
    container.appendChild(document.createRange().createContextualFragment(html));
    document.body.appendChild(container);
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);
    hydrateRoot(container, <MemoryRouter initialEntries={['/khong-co']}><AppRoutes /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 30));
    console.error = orig;
    expect(container.textContent).toContain('404');
    expect(errors.join('\n')).not.toMatch(/hydrat/i);
  });
