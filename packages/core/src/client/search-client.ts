import type { SearchHit, SearchManifest } from './search-core.js';
import type { SearchWorkerInbound, SearchWorkerResponse } from './search-worker.js';

// Đặc tả: docs/backlog/DM-802.md. Phía main thread: gửi query qua `port` (injectable — test dùng
// fake port đồng bộ, production dùng Worker thật), theo dõi `seq` để BỎ kết quả cũ khi người dùng
// gõ liên tục (tiêu chí d). MiniSearch.search() là đồng bộ bên trong worker — worker không tự huỷ
// được một query ĐANG CHẠY, nên "chỉ trả kết quả truy vấn cuối" phải là trách nhiệm của main
// thread, không phải worker (quyết định theo review).

export type SearchPortMessageHandler = ((ev: { data: SearchWorkerResponse }) => void) | null;

export interface SearchPort {
  postMessage(msg: SearchWorkerInbound): void;
  onmessage: SearchPortMessageHandler;
}

export interface UseSiteSearchLike {
  search(query: string, locale: string): Promise<SearchHit[]>;
  dispose(): void;
}

/** Bọc một `Worker` thật (DOM) thành `SearchPort` — chỉ dùng ở runtime trình duyệt thật. */
export function wrapRealWorker(worker: Worker): SearchPort {
  return {
    postMessage: (msg) => worker.postMessage(msg),
    set onmessage(handler: SearchPortMessageHandler) {
      // SAFETY: Worker.onmessage nhận MessageEvent<any>; handler của ta chỉ đọc `ev.data` có dạng
      // SearchWorkerResponse (do search-worker.ts post). Chữ ký hẹp hơn nên cần cast.
      worker.onmessage = handler as ((ev: MessageEvent) => void) | null;
    },
    get onmessage(): SearchPortMessageHandler {
      return worker.onmessage as SearchPortMessageHandler;
    },
  };
}

export class SearchClient implements UseSiteSearchLike {
  private readonly port: SearchPort;
  private seq = 0;
  private pending = new Map<number, { resolve: (hits: SearchHit[]) => void }>();

  constructor(port: SearchPort, manifest: SearchManifest) {
    this.port = port;
    this.port.onmessage = (ev) => this.handleMessage(ev.data);
    this.port.postMessage({ type: 'init', manifest });
  }

  private handleMessage(res: SearchWorkerResponse): void {
    const entry = this.pending.get(res.id);
    if (!entry) return; // đã bị drop bởi truy vấn mới hơn (d) hoặc dispose() — bỏ qua im lặng.
    this.pending.delete(res.id);
    // (error) fail open: worker đã lọc an toàn, main thread chỉ cần coi error == hits rỗng cho UI.
    entry.resolve(res.hits as SearchHit[]);
  }

  /** (c) truy vấn rỗng -> [] ngay, KHÔNG gửi qua port (không tốn một round-trip worker).
   * (d) chỉ Promise của `seq` MỚI NHẤT được resolve với hit thật; mọi `search()` gọi trước
   * đó còn đang chờ được resolve NGAY với `[]` (không treo Promise mãi — tránh rò bộ nhớ nếu
   * UI không bao giờ nhận lại response của chúng). */
  search(query: string, locale: string): Promise<SearchHit[]> {
    if (!query.trim()) return Promise.resolve([]);
    for (const [id, entry] of this.pending) {
      entry.resolve([]);
      this.pending.delete(id);
    }
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.port.postMessage({ id, type: 'search', query, locale });
    });
  }

  dispose(): void {
    for (const [id, entry] of this.pending) {
      entry.resolve([]);
      this.pending.delete(id);
    }
    this.port.onmessage = null;
  }
}
