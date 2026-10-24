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
