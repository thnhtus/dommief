import MiniSearch from 'minisearch';
import { createMiniSearchConfig, SEARCH_FIELDS, SEARCH_STORE_FIELDS } from '../search-config.js';
import type { SearchDocument } from '../search.js';

// Đặc tả: docs/backlog/DM-802.md. Module THUẦN (không postMessage, không `self`/`window`) để có
// thể unit test trực tiếp VÀ tái dùng y hệt trong Worker thật lẫn fake port — giữ logic nạp/cache/
// query tách khỏi plumbing, theo đúng khuyến nghị review (worker test trong vitest không có
// `Worker` thật: jsdom không có global đó, Node chỉ có `node:worker_threads` khác API hẳn).

export interface SearchHit {
  id: string;
  routeId: string;
  path: string;
  pageTitle: string;
  sectionTitle: string;
  pageKey: string;
  sectionKey: string;
  score: number;
  /** Nguyên văn đoạn text gốc (store field `value` của SearchDocument) — UI (DM-803) tự cắt
   * snippet quanh `highlight` và bọc `<mark>`, không phải tìm lại trong chuỗi (tiêu chí DM-802 scope). */
  value: string;
  /** Vị trí từ khoá khớp trong `value` gốc (KHÔNG phải snippet) — null nếu không định vị được
   * (vd khớp qua fuzzy/stripped-diacritics không trùng chuỗi con nguyên văn). */
  highlight: { start: number; end: number } | null;
}

export interface SearchErrorResult { hits: []; error: string }
export type SearchResultOrError = { hits: SearchHit[]; error?: undefined } | SearchErrorResult;

/** Đổi được trong test (không `fetch` thật) — chữ ký tối giản: URL vào, JSON text ra. */
export type FetchText = (url: string) => Promise<string>;

export interface SearchManifest { locales: Record<string, string> }

const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search index ${url} -> HTTP ${res.status}`);
  return res.text();
};

/** Tìm vị trí `query` (cắt khoảng trắng, so không phân biệt hoa/thường) trong `value` gốc.
 * Không normalize dấu (khớp nguyên văn người dùng gõ) — nếu không tìm thấy do tokenizer tách
 * nhỏ hơn (vd dấu câu ở giữa), trả null thay vì đoán sai vị trí. */
export function findHighlightRange(value: string, query: string): { start: number; end: number } | null {
  const q = query.trim();
  if (!q) return null;
  const idx = value.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;
  return { start: idx, end: idx + q.length };
}

export class SearchCore {
  private readonly manifest: SearchManifest;
  private readonly fetchText: FetchText;
  private readonly indexByLocale = new Map<string, MiniSearch<SearchDocument>>();
  private readonly loadingByLocale = new Map<string, Promise<MiniSearch<SearchDocument>>>();

  constructor(manifest: SearchManifest, fetchText: FetchText = defaultFetchText) {
    this.manifest = manifest;
    this.fetchText = fetchText;
  }

  /** Số lần đã `fetchText` — chỉ dùng trong test để kiểm "chưa truy vấn -> 0 request" (tiêu chí a). */
  fetchCount = 0;

  /** Huỷ cache của một locale (đổi locale không rò bộ nhớ locale cũ — tiêu chí DM-802 #3). */
  dropLocale(locale: string): void {
    this.indexByLocale.delete(locale);
    this.loadingByLocale.delete(locale);
  }

  private async load(locale: string): Promise<MiniSearch<SearchDocument>> {
    const cached = this.indexByLocale.get(locale);
    if (cached) return cached;
    const inFlight = this.loadingByLocale.get(locale);
    if (inFlight) return inFlight;
    const url = this.manifest.locales[locale];
    if (!url) throw new Error(`search: không có index cho locale "${locale}"`);
    const promise = (async () => {
      this.fetchCount++;
      const text = await this.fetchText(url);
      const cfg = createMiniSearchConfig();
      const ms = MiniSearch.loadJSON<SearchDocument>(text, { fields: [...SEARCH_FIELDS], storeFields: [...SEARCH_STORE_FIELDS], ...cfg });
      this.indexByLocale.set(locale, ms);
      this.loadingByLocale.delete(locale);
      return ms;
    })();
    this.loadingByLocale.set(locale, promise);
    return promise;
  }

  /** (c) Truy vấn rỗng -> [] ngay, KHÔNG fetch — kiểm tra TRƯỚC khi đụng tới `load()`. */
  async search(query: string, locale: string): Promise<SearchResultOrError> {
    if (!query.trim()) return { hits: [] };
    try {
      const ms = await this.load(locale);
      const results = ms.search(query, { prefix: true, fuzzy: 0.2, combineWith: 'AND' });
      const hits: SearchHit[] = results.map((r) => ({
        id: String(r.id),
        routeId: r.routeId as string,
        path: r.path as string,
        pageTitle: r.pageTitle as string,
        sectionTitle: r.sectionTitle as string,
        pageKey: r.pageKey as string,
        sectionKey: r.sectionKey as string,
        score: r.score,
        value: r.value as string,
        highlight: findHighlightRange(r.value as string, query),
      }));
      return { hits };
    } catch (e: unknown) {
      // (e) Fail open: KHÔNG throw ra ngoài — URL sai/parse lỗi/mạng lỗi đều trả {hits:[], error}
      // với thông điệp an toàn (không stack trace rò thông tin nội bộ).
      return { hits: [], error: e instanceof Error ? e.message : 'search index load failed' };
    }
  }
}
