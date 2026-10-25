import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DommiefError } from './markdown/errors.js';

/**
 * Tìm file trong `client/` của chính package này. Từ source (`src/*.ts`) file nằm ở `./client/`;
 * từ bản build (`dist/*.js`, tsup gộp mọi thứ vào một cấp) nằm ở `../src/client/`.
 * Ném lỗi có tên nếu cả hai đều không có — thay vì để Vite báo UNRESOLVED_ENTRY khó hiểu.
 */
export function resolveClientFile(name: string): string {
  const candidates = [`./client/${name}`, `../src/client/${name}`].map((rel) => fileURLToPath(new URL(rel, import.meta.url)));
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) {
    throw new DommiefError(`không tìm thấy client/${name} của dommief (đã thử: ${candidates.join(', ')}). Package cài thiếu thư mục "src".`, { code: 'client_entry_missing' });
  }
  return hit;
}

/**
 * Absolute path tới `theme-api.tsx` NGUỒN (không phải `dist/theme-api.js`).
 *
 * Quan trọng: `package.json` export `./theme-api` trỏ `dist/theme-api.js`, nhưng `entry-client`/
 * `entry-server` (bản thân `dommief/client`, luôn là SOURCE) import `theme-api` qua đường dẫn
 * tương đối `../theme-api.js` — tức là SOURCE. Nếu theme-default import `dommief/theme-api`
 * (qua alias package) mà Vite resolve ra `dist/theme-api.js`, đó là MỘT module KHÁC với
 * `SiteContext`/`createContext` riêng — `SiteProvider` (trong entry) set context nguồn, còn
 * `useSiteData()` (trong theme, qua dist) đọc context đích khác, luôn `null`. Hậu quả quan
 * sát được: `Navbar`/`Sidebar` render rỗng dù `virtual:dommief/site` có đầy đủ dữ liệu.
 * Vite plugin phải alias `dommief/theme-api` → đúng file này để luôn chỉ có MỘT instance.
 */
export function resolveThemeApiFile(): string {
  const candidates = ['./theme-api.tsx', '../src/theme-api.tsx'].map((rel) => fileURLToPath(new URL(rel, import.meta.url)));
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) {
    throw new DommiefError(`không tìm thấy theme-api.tsx của dommief (đã thử: ${candidates.join(', ')})`, { code: 'client_entry_missing' });
  }
  return hit;
}
