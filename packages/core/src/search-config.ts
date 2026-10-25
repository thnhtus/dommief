// Đặc tả: docs/backlog/DM-804.md. Cấu hình MiniSearch DUY NHẤT dùng chung cho build (search.ts,
// chạy trong Node) và client worker (search-worker.ts, chạy trong trình duyệt) — tách riêng
// module này vì search.ts import `minisearch` + dùng `Buffer` (Node-only); worker không được
// kéo theo bất cứ thứ gì Node-only (cùng loại bẫy với vite/plugin.ts từng lỡ import theme-api.tsx
// có React — xem comment plugin.ts).

export interface MiniSearchConfig {
  tokenize: (text: string) => string[];
  processTerm: (term: string) => string | null;
}

const CJK_RANGE = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function createMiniSearchConfig(): MiniSearchConfig {
  const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const processTerm = (term: string) => {
    // `đ` không tách được bằng NFD nên đổi tay
    const t = stripDiacritics(term).toLowerCase().replace(/đ/g, 'd').normalize('NFC').trim();
    return t.length ? t : null;
  };
  const tokenize = (text: string) => {
    const out: string[] = [];
    for (const raw of text.split(/[\s\p{P}]+/u)) {
      if (!raw) continue;
      // CJK: tách theo từng ký tự
      let buf = '';
      for (const ch of raw) {
        if (CJK_RANGE.test(ch)) {
          if (buf) { out.push(buf); buf = ''; }
          out.push(ch);
        } else {
          buf += ch;
        }
      }
      if (buf) out.push(buf);
    }
    return out;
  };
  return { tokenize, processTerm };
}

/** Field/storeFields MiniSearch dùng chung giữa build (search.ts) và client (search-core.ts) —
 * lệch field giữa hai phía làm `MiniSearch.loadJSON` đọc nhầm hoặc thiếu dữ liệu hiển thị. */
export const SEARCH_FIELDS = ['value', 'pageTitle', 'sectionTitle'] as const;
export const SEARCH_STORE_FIELDS = ['routeId', 'path', 'pageTitle', 'sectionTitle', 'paraId', 'value', 'pageKey', 'sectionKey'] as const;
