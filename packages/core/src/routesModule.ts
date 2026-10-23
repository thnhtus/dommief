import { winPath } from './utils/path.js';
import type { Route } from './types.js';

// Đặc tả: docs/spec/CONTRACTS.md §5 (`virtual:dommief/routes`), backlog DM-206.

/** Phần tử của `virtual:dommief/routes`. */
export interface RouteModule {
  id: string;
  path: string;
  /** `React.LazyExoticComponent<React.ComponentType>` — typed loosely: repo has no `@types/react`. */
  component: unknown;
  /**
   * Nạp module của route (cùng import với `component`). Idempotent: cache promise.
   * SSG (DM-402) **phải** `await Promise.all(routes.map(r => r.preload()))` trước lần
   * render đầu: `React.lazy` chưa resolve thì renderToStaticMarkup ra fallback,
   * renderToString throw.
   */
  preload: () => Promise<unknown>;
}

/**
 * Runtime của một route. Được inline bằng `toString()` vào module sinh ra, nên
 * không được tham chiếu identifier ngoài tham số (bundler có thể đổi tên import) —
 * vì vậy `lazy` là tham số.
 */
export function createRouteModule(
  lazy: (load: () => any) => unknown,
  id: string,
  path: string,
  load: () => Promise<unknown>,
): RouteModule {
  let mod: any;
  let promise: Promise<unknown> | undefined;
  const preload = () => {
    if (!promise) promise = load().then((m: any) => { mod = m; return m; });
    return promise;
  };
  // Đã preload ⇒ trả thenable gọi callback ĐỒNG BỘ: React.lazy chỉ resolve kịp trong
  // SSR đồng bộ khi `then` chạy ngay; Promise thật (kể cả đã fulfilled) chạy ở microtask.
  const component = lazy(() => (mod ? { then: (res: any) => res(mod) } : preload()) as any);
  return { id, path, component, preload };
}

/**
 * Sinh code cho `virtual:dommief/routes`: mỗi route là `React.lazy` quanh
 * `import("/abs/file.md")` (absolute POSIX, qua `winPath`).
 * Chỉ dùng `id`/`path`/`file` — không frontmatter/toc/texts, nên module bất biến khi
 * sửa nội dung md (CONTRACTS §5).
 */
export function createRoutesModule(routes: Route[]): string {
  const entries = routes.map(
    (r) =>
      `  createRouteModule(React.lazy, ${JSON.stringify(r.id)}, ${JSON.stringify(r.path)}, () => import(${JSON.stringify(winPath(r.file))})),`,
  );
  return `import React from "react";
const createRouteModule = ${createRouteModule.toString()};
export default [
${entries.join('\n')}
];
`;
}
