import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { NavItem, PageSummary, SidebarGroup, SiteData } from './types.js';
import { PREFERS_COLOR_ATTR, PREFERS_COLOR_STORAGE_KEY, type ColorValue, type PrefersColorValue } from './prefers-color.js';

export type { SiteData, NavItem, SidebarGroup, TocEntry, PageSummary } from './types.js';
export { PREFERS_COLOR_ATTR, PREFERS_COLOR_STORAGE_KEY, PREFERS_COLOR_BOOT_SCRIPT, resolveConfiguredColor } from './prefers-color.js';
export type { ColorValue, PrefersColorValue } from './prefers-color.js';
export { ClientOnly } from './client/ClientOnly.js';
export type { ClientOnlyProps } from './client/ClientOnly.js';

export const SiteContext = createContext<SiteData | null>(null);

export function SiteProvider({ value, children }: { value: SiteData; children?: ReactNode }) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteData(): SiteData {
  const ctx = useContext(SiteContext);
  return (ctx ?? ({} as SiteData));
}

/** Locale của pathname (đã bỏ basename): route khớp → locale của route; không khớp (404) → base locale dài nhất; cuối cùng locale mặc định. */
export function localeIdFor(site: SiteData, pathname: string): string {
  const locales = site.locales ?? [];
  const def = locales[0]?.id ?? '';
  const route = Object.values(site.routes ?? {}).find((r) => r.path === pathname);
  if (route) return route.locale ?? def;
  const hit = locales
    .filter((l) => l.suffix === '' && l.base !== '/' && (pathname + '/').startsWith(l.base))
    .sort((a, b) => b.base.length - a.base.length)[0];
  return hit?.id ?? def;
}

export function useRouteMeta(): PageSummary {
  const site = useSiteData();
  const { pathname } = useLocation();
  const route = Object.values(site.routes ?? {}).find((r) => r.path === pathname);
  return (route ? site.meta?.[route.id] : undefined) ?? { frontmatter: {} };
}

export function useNavData(): NavItem[] {
  const site = useSiteData();
  const { pathname } = useLocation();
  return site.nav?.[localeIdFor(site, pathname)] ?? [];
}

export function useSidebarData(): SidebarGroup[] {
  const site = useSiteData();
  const { pathname } = useLocation();
  return site.sidebar?.[localeIdFor(site, pathname)] ?? [];
}

// --- usePrefersColor (THEME-API §7.6, §9.2) ---
// Hằng số dùng chung sống ở prefers-color.ts (KHÔNG import 'react') để vite/plugin.ts (chạy
// trong tiến trình CLI, build-time) có thể dùng chúng mà không kéo 'react' vào process đó —
// xem comment chi tiết trong prefers-color.ts, lỗi quan sát được là
// `TypeError: dispatcher.getOwner is not a function` (hai instance react khác dispatcher).
//
// Nguồn sự thật = attribute `data-prefers-color` trên `<html>` + `localStorage`, KHÔNG phải
// React state: nhiều instance hook phải thấy cùng giá trị ngay khi một nơi gọi `setPrefers`,
// và `matchMedia` phải tự cập nhật theo OS khi đang ở `'auto'`.

function readStoredPrefers(): PrefersColorValue | null {
  try {
    const v = localStorage.getItem(PREFERS_COLOR_STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'auto' ? v : null;
  } catch {
    // Safari private mode (và một số môi trường khóa localStorage) ném lỗi thay vì trả null.
    return null;
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function resolveColor(prefers: PrefersColorValue): ColorValue {
  return prefers === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : prefers;
}

function applyColor(color: ColorValue): void {
  try {
    document.documentElement.setAttribute(PREFERS_COLOR_ATTR, color);
  } catch {
    /* no-op: không có document (SSR) không bao giờ tới đây vì chỉ gọi trong effect/handler */
  }
}

type PrefersListener = () => void;
const prefersListeners = new Set<PrefersListener>();

function emitPrefersChange(): void {
  for (const l of prefersListeners) l();
}

/**
 * `setPrefers` dùng chung cho mọi nơi gọi (hook, inline script không dùng hàm này vì chạy
 * trước khi React mount — xem `PREFERS_COLOR_BOOT_SCRIPT` trong prefers-color.ts). Ghi
 * localStorage + attribute + báo mọi instance `usePrefersColor` khác re-render.
 */
export function setPrefersColor(value: PrefersColorValue): void {
  try {
    localStorage.setItem(PREFERS_COLOR_STORAGE_KEY, value);
  } catch {
    /* Safari private mode: vẫn áp dụng cho phiên này, chỉ không nhớ lần sau */
  }
  applyColor(resolveColor(value));
  emitPrefersChange();
}

function subscribePrefers(onChange: PrefersListener): () => void {
  prefersListeners.add(onChange);
  const media = (() => { try { return window.matchMedia('(prefers-color-scheme: dark)'); } catch { return null; } })();
  media?.addEventListener('change', onChange);
  const onStorage = (e: StorageEvent) => { if (e.key === PREFERS_COLOR_STORAGE_KEY || e.key === null) onChange(); };
  window.addEventListener('storage', onStorage);
  return () => {
    prefersListeners.delete(onChange);
    media?.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function getPrefersSnapshot(): PrefersColorValue {
  return readStoredPrefers() ?? 'auto';
}

/**
 * `[color, prefers, setPrefers]`. Ở SSR và lần render đầu sau hydrate, `color`/`prefers` là
 * `undefined` để KHÔNG BAO GIỜ lệch với HTML tĩnh (hydration mismatch) — `ColorSwitch`
 * phải render icon trung tính khi `color === undefined`.
 */
export function usePrefersColor(): [color: ColorValue | undefined, prefers: PrefersColorValue | undefined, setPrefers: (v: PrefersColorValue) => void] {
  // SAFETY: `getServerSnapshot` của useSyncExternalStore yêu cầu cùng kiểu với snapshot thường;
  // ở SSR/render đầu ta CỐ ĐỊNH trả `undefined` (không phải một PrefersColorValue thật) đúng
  // theo hợp đồng THEME-API §7.6 để tránh hydration mismatch; kiểu trả về đã khai `| undefined`.
  const prefers = useSyncExternalStore(subscribePrefers, getPrefersSnapshot, () => undefined as unknown as PrefersColorValue);
  const color = prefers === undefined ? undefined : resolveColor(prefers);
  return [color, prefers, setPrefersColor];
}
