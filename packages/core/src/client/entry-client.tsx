import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter, matchPath } from 'react-router';
import { AppRoutes } from './AppRoutes.js';
import virtualRoutes from 'virtual:dommief/routes';
import virtualSite from 'virtual:dommief/site';
import { SiteProvider } from '../theme-api.js';

/**
 * react-router không tự redirect `/foo/` → `/foo`. Normalize bằng `replaceState`
 * (static host vẫn phục vụ `/foo/` qua `dist/foo/index.html` của SSG — cần cả hai).
 * Guard `typeof window`: module có thể bị import ở SSR.
 */
export function normalizeTrailingSlash(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    window.history.replaceState(window.history.state, '', pathname.replace(/\/+$/, '') + search + hash);
  }
}

/** Pathname tương đối `base` ('/sub/' + 'guide' → '/guide'). */
export function stripBase(pathname: string, base: string): string {
  const b = base.replace(/\/$/, '');
  if (b && (pathname === b || pathname.startsWith(b + '/'))) return pathname.slice(b.length) || '/';
  return pathname;
}

async function start(): Promise<void> {
  normalizeTrailingSlash();
  const el = document.getElementById('root');
  if (!el) return;
  const base = virtualSite.base;
  // React.lazy chưa resolve thì client render fallback rỗng và lệch HTML SSG → hydrate mismatch.
  // Nạp trước đúng trang đang mở rồi mới hydrate.
  const here = stripBase(window.location.pathname, base);
  const current = virtualRoutes.find((r) => matchPath({ path: r.path, end: true }, here));
  if (current) await current.preload();
  hydrateRoot(
    el,
    <BrowserRouter basename={base.replace(/\/$/, '') || '/'}>
      <SiteProvider value={virtualSite}>
        <AppRoutes />
      </SiteProvider>
    </BrowserRouter>,
  );
}

if (typeof window !== 'undefined') void start();
