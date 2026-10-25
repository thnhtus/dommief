import { DommiefError } from './markdown/errors.js';

// Đặc tả: docs/backlog/DM-408.md. Cổng ở mức prerender: trước renderToString, cài getter trên
// `window`/`document` để BẤT KỲ truy cập nào trong thân render ném lỗi NGAY (không chỉ warn) —
// chạy đúng điều kiện production khi người dùng chỉ "warn rồi bỏ qua" là nhận trang trắng/
// hydration lỗi trên site thật. Throw sớm, tại route hỏng, kèm routeId sửa được trong 1 phút.

type PropertyKey2 = 'window' | 'document';

interface SavedDescriptor { key: PropertyKey2; descriptor: PropertyDescriptor | undefined; }

let installed: SavedDescriptor[] | null = null;
// Đếm số lần `withSsrGuard` đang CHẠY ĐỖNG THờI: khi `config.ssg.concurrency > 1`,
// nhiều route render SONG SONG (build.ts `mapLimit`) dùng chung `globalThis`. Nếu không đếm,
// route A xong trước sẽ `uninstall()` và gỡ guard giữa chừng khi route B vẫn đang render
// — B mất bảo vệ mà không ai biết. Chỉ `uninstall()` thật khi đếm về 0.
let refCount = 0;

function guardGetter(name: PropertyKey2): PropertyDescriptor {
  return {
    configurable: true,
    enumerable: false,
    get(): never {
      throw new DommiefError(
        `truy cập "${name}" lúc render (SSR) — lỗi \`ssr_unsafe_access\`. Chuyển vào useEffect/event handler, hoặc bọc nội dung trong <ClientOnly>. Nếu đây là code của thư viện bên thứ 3 đọc "${name}" ngay lúc import (top-level), chuyển sang import động bên trong useEffect.`,
        { code: 'ssr_unsafe_access' },
      );
    },
  };
}

/**
 * Cài getter chặn `window`/`document` trên `globalThis`. Idempotent: gọi 2 lần không đè descriptor gốc lần 2
 * (nếu không, `uninstall()` sau đó sẽ khôi phục nhầm descriptor-chặn thay vì descriptor thật).
 * Tắt bằng `DOMMIEF_SSR_GUARD=0` — đường thoát cho theme bên thứ 3 đang chuyển đổi.
 */
export function install(): void {
  if (process.env.DOMMIEF_SSR_GUARD === '0') return;
  if (installed) return;
  const saved: SavedDescriptor[] = [];
  for (const key of ['window', 'document'] as const) {
    saved.push({ key, descriptor: Object.getOwnPropertyDescriptor(globalThis, key) });
    Object.defineProperty(globalThis, key, guardGetter(key));
  }
  installed = saved;
}

/** Gỡ getter, khôi phục descriptor gốc (kể cả khi gốc là `undefined` — Node không có sẵn `window`). PHẢI gọi trong `finally` để không rò getter sang route sau khi route hiện tại throw. */
export function uninstall(): void {
  if (!installed) return;
  for (const { key, descriptor } of installed) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as any)[key];
  }
  installed = null;
}

/**
 * Chạy `fn` với cổng SSR-safety bật, luôn gỡ sau khi xong (kể cả throw). An toàn khi nhiều
 * lời gọi chạy SONG SONG (reference counting): guard thật chỉ bị gỡ khi lần gọi CUỐI
 * CÙNG đang chạy hoàn tất, không phải lần đầu tiên xong.
 */
export async function withSsrGuard<T>(fn: () => Promise<T>): Promise<T> {
  refCount++;
  install();
  try {
    return await fn();
  } finally {
    refCount--;
    if (refCount === 0) uninstall();
  }
}
