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

// Theme-default thật (Navbar/Sidebar/Toc/ColorSwitch) hydrate sạch khi site có nav/sidebar/toc
// và `usePrefersColor` trả undefined ở lần render đầu (không được lệch HTML tĩnh).
describe('hydrate ssr — với theme layout đầy đủ + dữ liệu site', () => {
  it('trang có nav/sidebar/toc/ColorSwitch hydrate không mismatch, 404 cũng vậy', async () => {
    const { SiteProvider } = await import('../packages/core/src/theme-api.tsx');
    const site: any = {
      base: '/', title: 't', locales: [{ id: 'en-US', name: 'English', base: '/', suffix: '' }], themeConfig: {},
      routes: { 'guide/intro': { id: 'guide/intro', path: '/guide/intro', file: '/x.md' } },
      meta: { 'guide/intro': { frontmatter: {}, toc: [{ id: 'a', depth: 1, title: 'Alpha' }] } },
      nav: { 'en-US': [{ title: 'Intro', link: '/guide/intro', order: 0, activePath: '/guide/intro' }] },
      sidebar: { 'en-US': [{ title: 'guide', order: 0, children: [{ title: 'Intro', link: '/guide/intro', order: 0 }] }] },
    };
    const routes = [page('guide/intro', '/guide/intro', 'INTRO-THEMED')];
    await Promise.all(routes.map((r) => r.preload()));
    const AppRoutes = createAppRoutes(routes);
    for (const location of ['/guide/intro', '/khong-co']) {
      const html = renderToString(<SiteProvider value={site}><StaticRouter location={location}><AppRoutes /></StaticRouter></SiteProvider>);
      expect(html).toContain('aria-label="Main"');
      expect(html, location).toContain('id="main"'); // skip-link luôn có đích, kể cả trang 404
      expect(html).toContain('aria-label="Đổi giao diện sáng/tối"'); // ColorSwitch: nhãn trung tính ở render đầu
      const container = document.createElement('div');
      container.appendChild(document.createRange().createContextualFragment(html));
      document.body.appendChild(container);
      const errors: unknown[] = [];
      const orig = console.error;
      console.error = (...args: unknown[]) => errors.push(args[0]);
      hydrateRoot(container, <SiteProvider value={site}><MemoryRouter initialEntries={[location]}><AppRoutes /></MemoryRouter></SiteProvider>);
      await new Promise((r) => setTimeout(r, 30));
      console.error = orig;
      expect(errors.join('\n'), location).not.toMatch(/hydrat|did not match|mismatch/i);
    }
  });
});
