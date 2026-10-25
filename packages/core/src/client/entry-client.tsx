import { hydrateRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { BrowserRouter, matchPath, useNavigate } from 'react-router';
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

/**
 * Link trong nội dung markdown là `<a>` thường (hast → JSX, không qua `<Link>`), nên bấm vào là tải lại
 * cả trang (mất state, nháy trắng, nạp lại bundle — bắt bằng e2e trình duyệt thật). Uỷ quyền một
 * listener ở `document`: chỉ bắt click trái thuần (không modifier), `<a>` cùng origin, không `target`/
 * `download`, đường dẫn nằm dưới `base`; còn lại để trình duyệt xử lý. Hash-only trên cùng trang cũng
 * để trình duyệt cuộn (không `navigate`).
 */
export function shouldIntercept(e: MouseEvent, a: HTMLAnchorElement, base: string): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if (a.target && a.target !== '_self') return null;
  if (a.hasAttribute('download') || a.origin !== window.location.origin) return null;
  const b = base.replace(/\/$/, '');
  if (b && !(a.pathname === b || a.pathname.startsWith(b + '/'))) return null;
  if (a.pathname === window.location.pathname && a.search === window.location.search) return null;
  return stripBase(a.pathname, base) + a.search + a.hash;
}

function LinkInterceptor({ base }: { base: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.hasAttribute('data-discover')) return; // `<Link>` của router tự xử lý
      const to = shouldIntercept(e, a, base);
      if (to === null) return;
      e.preventDefault();
      navigate(to);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate, base]);
  return null;
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
        <LinkInterceptor base={base} />
        <AppRoutes />
      </SiteProvider>
    </BrowserRouter>,
  );
}

if (typeof window !== 'undefined') void start();
