import { lazy } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { createRouteModule, type RouteModule } from '../packages/core/src/routesModule.ts';

// AppRoutes.tsx import virtual module chỉ có dưới Vite → mock rỗng; test dùng createAppRoutes(routes).
vi.mock('virtual:dommief/routes', () => ({ default: [] }));
const { createAppRoutes } = await import('../packages/core/src/client/AppRoutes.tsx');

const seenProps: object[] = [];
function page(id: string, path: string, text: string): RouteModule {
  const Comp = (props: object) => {
    seenProps.push(props);
    return <p>{text}</p>;
  };
  return createRouteModule(lazy, id, path, () => Promise.resolve({ default: Comp }));
}

const routes = [page('index', '/', 'INDEX-PAGE'), page('guide/intro', '/guide/intro', 'INTRO-PAGE')];
const html = (url: string) => {
  const AppRoutes = createAppRoutes(routes);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes />
    </MemoryRouter>,
  );
};

describe('createAppRoutes', () => {
  it('(d) chưa preload → fallback rỗng, không throw', () => {
    expect(() => html('/')).not.toThrow();
    expect(html('/')).not.toContain('INDEX-PAGE');
  });

  it('(a) / → trang index sau preload', async () => {
    await Promise.all(routes.map((r) => r.preload()));
    expect(html('/')).toContain('INDEX-PAGE');
  });

  it('(b) /guide/intro → đúng trang', () => {
    const out = html('/guide/intro');
    expect(out).toContain('INTRO-PAGE');
    expect(out).not.toContain('INDEX-PAGE');
  });

  it('(c) path lạ → 404 + path hiện tại (route * cùng <Routes>)', () => {
    const out = html('/khong-co');
    expect(out).toContain('404');
    expect(out).toContain('/khong-co');
  });

  it('(e) component trang nhận props rỗng', () => {
    seenProps.length = 0;
    html('/guide/intro');
    expect(seenProps.length).toBeGreaterThan(0);
    for (const p of seenProps) expect(Object.keys(p)).toHaveLength(0);
  });
});
