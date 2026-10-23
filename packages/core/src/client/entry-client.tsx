// Entry dev/preview — `createRoot`, CHƯA hydrate (DM-407 đổi sang hydrateRoot).
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './AppRoutes.js';

/**
 * react-router không tự redirect `/foo/` → `/foo`. Normalize bằng `replaceState`
 * (static host vẫn phục vụ `/foo/` qua `dist/foo/index.html` của DM-404 — cần cả hai).
 * Guard `typeof window`: module có thể bị import ở SSR (DM-408).
 */
export function normalizeTrailingSlash(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    window.history.replaceState(window.history.state, '', pathname.replace(/\/+$/, '') + search + hash);
  }
}

if (typeof window !== 'undefined') {
  normalizeTrailingSlash();
  const el = document.getElementById('root');
  if (el) {
    createRoot(el).render(
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>,
    );
  }
}
