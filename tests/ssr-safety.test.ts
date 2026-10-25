import { afterEach, describe, expect, it } from 'vitest';
import { install, uninstall, withSsrGuard } from '../packages/core/src/ssr-guard.ts';
import { DommiefError } from '../packages/core/src/markdown/errors.ts';

// Đặc tả: docs/backlog/DM-408.md "Tiêu chí chấp nhận" #1 (4 ca a-d) + #2 (không rò giữa 2 lần gọi).
describe('ssr-guard (DM-408)', () => {
  afterEach(() => uninstall());

  it('(a) đọc window.innerWidth lúc "render" -> throw DommiefError code ssr_unsafe_access', async () => {
    const unsafeRender = async () => (globalThis as any).window.innerWidth;
    await expect(withSsrGuard(unsafeRender)).rejects.toMatchObject({ code: 'ssr_unsafe_access' });
    await expect(withSsrGuard(unsafeRender)).rejects.toBeInstanceOf(DommiefError);
  });

  it('(b) không truy cập window (giả lập <ClientOnly>: chỉ render fallback) -> không throw', async () => {
    const safeRender = async () => 'FALLBACK_HTML';
    await expect(withSsrGuard(safeRender)).resolves.toBe('FALLBACK_HTML');
  });

  it('(c) sau khi 1 route throw, globalThis.window trở lại như trước — route sạch sau đó vẫn render được', async () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
    await expect(withSsrGuard(async () => { throw new Error('route hỏng'); })).rejects.toThrow();
    expect(Object.getOwnPropertyDescriptor(globalThis, 'window')).toEqual(before);
    // "route sạch" gọi lại ngay sau — phải thành công, không bị nhiễu bởi route trước.
    await expect(withSsrGuard(async () => 'OK')).resolves.toBe('OK');
  });

  it('(d) DOMMIEF_SSR_GUARD=0 -> không throw (đường thoát)', async () => {
    process.env.DOMMIEF_SSR_GUARD = '0';
    try {
      await expect(withSsrGuard(async () => (globalThis as any).window?.innerWidth)).resolves.toBeUndefined();
    } finally {
      delete process.env.DOMMIEF_SSR_GUARD;
    }
  });

  it('nhiều route render song song (ssg.concurrency > 1): route A throw không gỡ guard của route B đang chạy', async () => {
    // QUAN TRỌNG: phải phân biệt "throw vì guard" (DommiefError ssr_unsafe_access) với "throw vì
    // `window` đơn giản là `undefined`" (TypeError tự nhiên của Node khi truy cập thuộc tính trên
    // undefined) — cả hai đều throw, nên chỉ assert "có throw" sẽ không bắt được race condition
    // (đã tự kiểm: xoá refCount khỏi ssr-guard.ts, bài test phiên bản cũ vẫn pass giả).
    let bError: unknown;
    const routeA = withSsrGuard(async () => {
      throw new Error('A hỏng');
    });
    const routeB = withSsrGuard(async () => {
      await new Promise((r) => setTimeout(r, 10));
      try { void (globalThis as any).window.x; } catch (e) { bError = e; }
      return bError;
    });
    await expect(routeA).rejects.toThrow();
    await routeB;
    expect(bError).toBeInstanceOf(DommiefError);
    expect((bError as DommiefError).code).toBe('ssr_unsafe_access');
  });

  it('install()/uninstall() thủ công: idempotent, không rò descriptor-chặn khi gọi install() 2 lần', () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
    install();
    install();
    uninstall();
    expect(Object.getOwnPropertyDescriptor(globalThis, 'window')).toEqual(before);
  });
});
