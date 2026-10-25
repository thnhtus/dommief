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
  /** Vị trí từ khoá khớp trong `value` gốc (KHÔNG phải snippet) — null nếu không định vị được. */
  highlight: { start: number; end: number } | null;
}

export interface SearchResult { hits: SearchHit[]; error?: string | undefined; superseded?: boolean }

/** Đổi được trong test (không `fetch` thật) — chữ ký tối giản: URL vào, JSON text ra. */
export type FetchText = (url: string) => Promise<string>;

export interface SearchManifest { locales: Record<string, string> }

/** Chặn payload postMessage/UI phình to: site lớn + query 1-2 ký tự + `prefix:true` có thể khớp
 * hàng trăm doc, mỗi doc mang nguyên `value`. Review #7. */
export const MAX_HITS = 50;

const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search index ${url} -> HTTP ${res.status}`);
  return res.text();
};

const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/**
 * Tìm vị trí từ khoá trong `value` gốc. So KHÔNG DẤU (review #6): tìm nguyên văn cả `query` trước
 * tiên (ca phổ biến, rẻ); nếu không khớp, thử so KHÔNG phân biệt dấu bằng cách quét từng vị trí
 * trong `value` và so một cửa sổ cùng độ dài sau khi strip dấu cả hai bên — vì `normalize('NFD')`
 * ĐỔI ĐỘ DÀI chuỗi (tổ hợp base+combining), không thể strip rồi `indexOf` rồi map ngược offset.
 * Trả null nếu không định vị được (vd khớp qua fuzzy không còn là chuỗi con liên tục nào).
 */
export function findHighlightRange(value: string, query: string): { start: number; end: number } | null {
  const q = query.trim();
  if (!q) return null;
  const idxExact = value.toLowerCase().indexOf(q.toLowerCase());
  if (idxExact !== -1) return { start: idxExact, end: idxExact + q.length };
  const qStripped = stripDiacritics(q).toLowerCase();
  if (!qStripped) return null;
  for (let start = 0; start <= value.length; start++) {
    // Mở rộng cửa sổ [start, end) tới khi phần đã strip dài bằng/ vượt `qStripped`, rồi so khớp.
    for (let end = start + 1; end <= value.length && end - start <= q.length + 8; end++) {
      const windowStripped = stripDiacritics(value.slice(start, end)).toLowerCase();
      if (windowStripped === qStripped) return { start, end };
      if (windowStripped.length > qStripped.length) break;
    }
  }
  return null;
}

export class SearchCore {
  private readonly manifest: SearchManifest;
  private readonly fetchText: FetchText;
  private readonly indexByLocale = new Map<string, MiniSearch<SearchDocument>>();
  private readonly loadingByLocale = new Map<string, Promise<MiniSearch<SearchDocument>>>();
  /** Token tăng dần mỗi `dropLocale()` — một promise `load()` đang bay khi bị drop phải KHÔNG
   * được ghi lại vào `indexByLocale` khi nó resolve sau đó (review #5: "cache sống lại"). */
  private readonly generationByLocale = new Map<string, number>();

  constructor(manifest: SearchManifest, fetchText: FetchText = defaultFetchText) {
    this.manifest = manifest;
    this.fetchText = fetchText;
  }

  /** Số lần đã `fetchText` — chỉ dùng trong test để kiểm "chưa truy vấn -> 0 request" (tiêu chí a). */
  fetchCount = 0;

  /** Huỷ cache của một locale (đổi locale không rò bộ nhớ locale cũ — tiêu chí DM-802 #3). Tăng
   * generation để loại bỏ kết quả của bất kỳ `load()` nào đang bay cho locale này. */
  dropLocale(locale: string): void {
    this.indexByLocale.delete(locale);
    this.loadingByLocale.delete(locale);
    this.generationByLocale.set(locale, (this.generationByLocale.get(locale) ?? 0) + 1);
  }

  private async load(locale: string): Promise<MiniSearch<SearchDocument>> {
    const cached = this.indexByLocale.get(locale);
    if (cached) return cached;
    const inFlight = this.loadingByLocale.get(locale);
    if (inFlight) return inFlight;
    const url = this.manifest.locales[locale];
    if (!url) throw new Error(`search: không có index cho locale "${locale}"`);
    const generationAtStart = this.generationByLocale.get(locale) ?? 0;
    const promise = (async () => {
      try {
        this.fetchCount++;
        const text = await this.fetchText(url);
        const cfg = createMiniSearchConfig();
        const ms = MiniSearch.loadJSON<SearchDocument>(text, { fields: [...SEARCH_FIELDS], storeFields: [...SEARCH_STORE_FIELDS], ...cfg });
        // Review #5: nếu `dropLocale()` đã chạy trong lúc fetch đang bay, KHÔNG ghi lại vào cache
        // — nếu không, index "cũ" sống lại ngay sau khi bị drop.
        if ((this.generationByLocale.get(locale) ?? 0) === generationAtStart) {
          this.indexByLocale.set(locale, ms);
        }
        return ms;
      } finally {
        // Review #1: PHẢI xoá dù thành công hay lỗi — nếu không, một lần fetch lỗi (mạng chập,
        // 502) làm promise rejected nằm lại `loadingByLocale` MÃI MÃI, mọi `search()` sau đó
        // nhận đúng lỗi cũ, không bao giờ thử lại.
        this.loadingByLocale.delete(locale);
      }
    })();
    this.loadingByLocale.set(locale, promise);
    return promise;
  }

  /** (c) Truy vấn rỗng -> [] ngay, KHÔNG fetch — kiểm tra TRƯỚC khi đụng tới `load()`. */
  async search(query: string, locale: string): Promise<SearchResult> {
    if (!query.trim()) return { hits: [] };
    try {
      const ms = await this.load(locale);
      const results = ms.search(query, { prefix: true, fuzzy: 0.2, combineWith: 'AND' }).slice(0, MAX_HITS);
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
