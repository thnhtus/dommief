// Hằng số + hàm thuần (KHÔNG import 'react') cho cơ chế dark mode (THEME-API §7.6, §9.2).
//
// LÝ DO TÁCH FILE RIÊNG (đã crash thật, không phải suy đoán): `vite/plugin.ts` chạy TRỰC TIẾP
// trong tiến trình Node của CLI (build-time), không qua bundle SSR của Vite. Nếu nó `import`
// thẳng từ `theme-api.tsx` (file có JSX + hook `react`), react bị nạp vào TIẾN TRÌNH CLI qua một
// đường resolve khác với bản mà `server.mjs` (nạp bằng `import()` động sau khi Vite build xong)
// dùng để `renderToPipeableStream` — kết quả: `TypeError: dispatcher.getOwner is not a function`
// (hai "bản" react không chia sẻ cùng dispatcher nội bộ). `theme-api.tsx` import lại từ đây để
// không trùng lặp định nghĩa, nhưng bản thân file này không bao giờ được import 'react'.
export type ColorValue = 'light' | 'dark';
export type PrefersColorValue = ColorValue | 'auto';

export const PREFERS_COLOR_ATTR = 'data-prefers-color';
export const PREFERS_COLOR_STORAGE_KEY = 'dommief:prefers-color';

/**
 * Inline script < 1KB, không `async`/`defer` (DM-510 tiêu chí #1), chạy TRƯỚC paint để không
 * nháy sáng rồi sang tối (FOUC). Chỉ **ghi đè** khi `localStorage` có lựa chọn (THEME-API
 * Amendment 2026-10-22 #1): giá trị mặc định từ config đã được SSR render thẳng vào
 * `<html data-prefers-color>` (xem vite/plugin.ts), nên trang vẫn đúng màu khi tắt JS.
 */
export const PREFERS_COLOR_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(PREFERS_COLOR_STORAGE_KEY)},a=${JSON.stringify(PREFERS_COLOR_ATTR)},v=localStorage.getItem(k);if(v!=='light'&&v!=='dark'&&v!=='auto')return;var c=v==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):v;document.documentElement.setAttribute(a,c)}catch(e){}})();`;

/** `'auto'|'dark'|'light'` khác `'auto'` → màu áp dụng thật (để SSR render attribute trên `<html>`). */
export function resolveConfiguredColor(defaultValue: PrefersColorValue | undefined): ColorValue | undefined {
  if (!defaultValue || defaultValue === 'auto') return undefined; // 'auto' KHÔNG BAO GIỜ ghi vào attribute (§9.2)
  return defaultValue;
}
