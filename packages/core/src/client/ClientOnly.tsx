import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

// Đặc tả: docs/spec/THEME-API.md §4, §8; backlog DM-408.
// `useState(false) + useEffect` là cách KHÔNG gây hydration mismatch: server render `fallback`,
// và client cũng render `fallback` ở LẦN RENDER ĐẦU (y hệt cây server) rồi mới swap sang
// `children` — không bao giờ có "cây server khác cây client lần đầu của client".
// KHÔNG dùng `typeof window` trong thân component này (nó phải sạch, không tự là nguồn lỗi
// mà ssr-guard.ts chặn) — `useEffect` tự nhiên không chạy ở server nên không cần kiểm tra đó.

/** `useLayoutEffect` ở client, `useEffect` ở server (tránh warning "useLayoutEffect does nothing on the server"). */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false);
  useIsomorphicLayoutEffect(() => { setMounted(true); }, []);
  return mounted ? children : fallback;
}
