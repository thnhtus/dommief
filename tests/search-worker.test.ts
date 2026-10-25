import { describe, expect, it, vi } from 'vitest';
import MiniSearch from 'minisearch';
import { SearchCore, findHighlightRange, MAX_HITS, type FetchText } from '../packages/core/src/client/search-core.ts';
import { SearchClient, type SearchPort, type SearchPortMessageHandler } from '../packages/core/src/client/search-client.ts';
import { createMiniSearchConfig, SEARCH_FIELDS, SEARCH_STORE_FIELDS } from '../packages/core/src/search-config.ts';
import type { SearchWorkerInbound } from '../packages/core/src/client/search-worker.ts';

// Đặc tả: DM-802. Worker thật không chạy được trong vitest (jsdom không có Worker) nên test
// logic qua SearchCore (thuần) + SearchClient với fake port; plumbing worker verify bằng build.

function makeIndex(docs: Array<Record<string, unknown>>): string {
  const ms = new MiniSearch({ fields: [...SEARCH_FIELDS], storeFields: [...SEARCH_STORE_FIELDS], ...createMiniSearchConfig() });
  ms.addAll(docs as never);
  return JSON.stringify(ms.toJSON());
}
const doc = (id: string, routeId: string, value: string) => ({
  id, routeId, path: `/${routeId}`, pageTitle: routeId, sectionTitle: routeId, paraId: 0, value, pageKey: routeId, sectionKey: `${routeId}::orphan`,
});
const INDEX_EN = makeIndex([doc('a#0', 'a', 'Vite is a fast bundler'), doc('b#0', 'b', 'Tiếng Việt có dấu')]);
const manifest = { locales: { 'en-US': '/search-index/en-US.json', 'vi-VN': '/search-index/vi-VN.json' } };

function fakeFetch(map: Record<string, string>): { fn: FetchText; calls: string[] } {
  const calls: string[] = [];
  return { calls, fn: async (url) => { calls.push(url); if (!(url in map)) throw new Error('HTTP 404'); return map[url]!; } };
}

describe('SearchCore (DM-802)', () => {
  it('(a) chưa truy vấn -> 0 fetch; truy vấn đầu tiên mới fetch, lần sau dùng cache', async () => {
    const f = fakeFetch({ '/search-index/en-US.json': INDEX_EN });
    const core = new SearchCore(manifest, f.fn);
    expect(f.calls.length).toBe(0);
    await core.search('vite', 'en-US');
    await core.search('bundler', 'en-US');
    expect(f.calls).toEqual(['/search-index/en-US.json']);
  });

  it('(b) từ khoá có trong fixture -> hit đúng routeId', async () => {
    const core = new SearchCore(manifest, fakeFetch({ '/search-index/en-US.json': INDEX_EN }).fn);
    const r = await core.search('vite', 'en-US');
    expect(r.error).toBeUndefined();
    expect(r.hits.map((h) => h.routeId)).toContain('a');
  });

  it('(b2) tiếng Việt có dấu: gõ không dấu vẫn ra', async () => {
    const core = new SearchCore(manifest, fakeFetch({ '/search-index/en-US.json': INDEX_EN }).fn);
    const r = await core.search('tieng viet', 'en-US');
    expect(r.hits.map((h) => h.routeId)).toContain('b');
  });

  it('(c) truy vấn rỗng/khoảng trắng -> [] và không fetch', async () => {
    const f = fakeFetch({});
    const core = new SearchCore(manifest, f.fn);
    expect((await core.search('', 'en-US')).hits).toEqual([]);
    expect((await core.search('   ', 'en-US')).hits).toEqual([]);
    expect(f.calls.length).toBe(0);
  });

  it('(e) URL index sai -> {hits:[], error}, không throw', async () => {
    const core = new SearchCore(manifest, fakeFetch({}).fn);
    const r = await core.search('vite', 'en-US');
    expect(r.hits).toEqual([]);
    expect(typeof r.error).toBe('string');
  });

  it('(e2) locale không có trong manifest -> error, không throw', async () => {
    const core = new SearchCore(manifest, fakeFetch({}).fn);
    const r = await core.search('vite', 'fr-FR');
    expect(r.hits).toEqual([]);
    expect(r.error).toMatch(/fr-FR/);
  });

  it('(e3) JSON hỏng -> error, không throw', async () => {
    const core = new SearchCore(manifest, fakeFetch({ '/search-index/en-US.json': '{not json' }).fn);
    const r = await core.search('vite', 'en-US');
    expect(r.hits).toEqual([]);
    expect(r.error).toBeTruthy();
  });

  it('(review #1) fetch lỗi lần 1 KHÔNG được dính mãi — lần 2 phải thử lại, không trả lại lỗi cũ từ cache', async () => {
    let calls = 0;
    const fn: FetchText = async () => {
      calls++;
      if (calls === 1) throw new Error('network hiccup');
      return INDEX_EN;
    };
    const core = new SearchCore(manifest, fn);
    const r1 = await core.search('vite', 'en-US');
    expect(r1.error).toBeTruthy();
    const r2 = await core.search('vite', 'en-US');
    expect(r2.error).toBeUndefined();
    expect(r2.hits.map((h) => h.routeId)).toContain('a');
    expect(calls).toBe(2);
  });

  it('truy vấn đồng thời cùng locale chỉ fetch 1 lần (in-flight dedupe)', async () => {
    const f = fakeFetch({ '/search-index/en-US.json': INDEX_EN });
    const core = new SearchCore(manifest, f.fn);
    await Promise.all([core.search('vite', 'en-US'), core.search('fast', 'en-US'), core.search('bundler', 'en-US')]);
    expect(f.calls.length).toBe(1);
  });

  it('(3) đổi locale: nạp index mới; dropLocale bỏ cache cũ nên lần sau fetch lại', async () => {
    const f = fakeFetch({ '/search-index/en-US.json': INDEX_EN, '/search-index/vi-VN.json': makeIndex([doc('c#0', 'c', 'Xin chào')]) });
    const core = new SearchCore(manifest, f.fn);
    await core.search('vite', 'en-US');
    expect((await core.search('chao', 'vi-VN')).hits.map((h) => h.routeId)).toEqual(['c']);
    expect(f.calls.length).toBe(2);
    await core.search('vite', 'en-US');
    expect(f.calls.length).toBe(2); // vẫn cache
    core.dropLocale('en-US');
    await core.search('vite', 'en-US');
    expect(f.calls.length).toBe(3);
  });

  it('(review #5) dropLocale() giữa lúc fetch đang bay -> index cũ KHÔNG được sống lại khi fetch đó resolve', async () => {
    let fetchCount = 0;
    let resolveFetch!: (v: string) => void;
    const fn: FetchText = () => {
      fetchCount++;
      if (fetchCount === 1) return new Promise((resolve) => { resolveFetch = resolve; });
      return Promise.resolve(INDEX_EN);
    };
    const core = new SearchCore(manifest, fn);
    const pending = core.search('vite', 'en-US'); // fetch #1 bắt đầu, chưa resolve
    core.dropLocale('en-US'); // drop NGAY trong lúc fetch #1 đang bay
    resolveFetch(INDEX_EN); // fetch #1 cuối cùng cũng resolve (nhưng generation đã lệch)
    await pending;
    // Nếu index "sống lại" từ promise #1 bất chấp đã bị drop, lần search tiếp theo sẽ dùng cache
    // (fetchCount dừng ở 1) thay vì fetch lại (fetchCount lên 2).
    await core.search('vite', 'en-US');
    expect(fetchCount).toBe(2);
  });

  it('(review #7) giới hạn số hit trả về (MAX_HITS)', async () => {
    const manyDocs = Array.from({ length: MAX_HITS + 20 }, (_, i) => doc(`d${i}#0`, `route${i}`, 'common-term appears here'));
    const index = makeIndex(manyDocs);
    const core = new SearchCore({ locales: { 'en-US': '/i.json' } }, fakeFetch({ '/i.json': index }).fn);
    const r = await core.search('common', 'en-US');
    expect(r.hits.length).toBeLessThanOrEqual(MAX_HITS);
  });

  it('(4) highlight trỏ đúng vị trí từ khoá trong value gốc (ASCII)', async () => {
    const core = new SearchCore(manifest, fakeFetch({ '/search-index/en-US.json': INDEX_EN }).fn);
    const r = await core.search('bundler', 'en-US');
    const hit = r.hits.find((h) => h.routeId === 'a')!;
    expect(hit.highlight).not.toBeNull();
    expect(hit.value.slice(hit.highlight!.start, hit.highlight!.end).toLowerCase()).toBe('bundler');
  });

  it('(review #6) highlight tiếng Việt: gõ KHÔNG dấu vẫn định vị đúng đoạn CÓ dấu trong value gốc', async () => {
    const core = new SearchCore(manifest, fakeFetch({ '/search-index/en-US.json': INDEX_EN }).fn);
    const r = await core.search('tieng viet', 'en-US');
    const hit = r.hits.find((h) => h.routeId === 'b')!;
    expect(hit.highlight).not.toBeNull();
    expect(hit.value.slice(hit.highlight!.start, hit.highlight!.end)).toBe('Tiếng Việt');
  });

  it('findHighlightRange: không phân biệt hoa/thường, không dấu, không thấy -> null', () => {
    expect(findHighlightRange('Hello World', 'world')).toEqual({ start: 6, end: 11 });
    expect(findHighlightRange('Tiếng Việt có dấu', 'tieng viet')).toEqual({ start: 0, end: 10 });
    expect(findHighlightRange('Đà Nẵng đẹp', 'da nang')).toEqual({ start: 0, end: 7 });
    expect(findHighlightRange('Hello', 'xyz')).toBeNull();
    expect(findHighlightRange('Hello', '  ')).toBeNull();
  });
});

// Fake port: ghi lại message gửi đi; test chủ động `reply()` để mô phỏng thứ tự trả lời của worker.
function fakePort() {
  const sent: SearchWorkerInbound[] = [];
  let handler: SearchPortMessageHandler = null;
  const terminate = vi.fn();
  const port: SearchPort = {
    postMessage: (m) => { sent.push(m); },
    get onmessage() { return handler; },
    set onmessage(h) { handler = h; },
    terminate,
  };
  return { port, sent, terminate, reply: (id: number, hits: unknown[] = [], error?: string) => handler?.({ data: { id, hits, error } }) };
}

describe('SearchClient (DM-802)', () => {
  it('gửi init với manifest ngay khi tạo, KHÔNG gửi search nào (lazy)', () => {
    const p = fakePort();
    new SearchClient(p.port, manifest);
    expect(p.sent).toEqual([{ type: 'init', manifest }]);
  });

  it('(c) truy vấn rỗng -> {hits:[]} ngay, không postMessage', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    expect(await c.search('  ', 'en-US')).toEqual({ hits: [] });
    expect(p.sent.length).toBe(1); // chỉ init
  });

  it('(d) hai truy vấn nhanh: chỉ truy vấn cuối nhận hit thật, kể cả khi worker trả LỆCH thứ tự', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    const first = c.search('vi', 'en-US');
    const second = c.search('vite', 'en-US');
    const [, m1, m2] = p.sent as Array<{ id: number }>;
    // worker trả kết quả của truy vấn CŨ sau cùng: không được ghi đè
    p.reply(m2!.id, [{ routeId: 'new' }]);
    p.reply(m1!.id, [{ routeId: 'old' }]);
    expect(await second).toEqual({ hits: [{ routeId: 'new' }] });
    const r1 = await first;
    expect(r1.hits).toEqual([]);
    expect(r1.superseded).toBe(true); // review #8: phân biệt "bị thay thế" với "không tìm thấy thật"
  });

  it('(d2) truy vấn cũ không treo Promise dù worker KHÔNG BAO GIỜ trả lời nó', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    const first = c.search('vi', 'en-US');
    c.search('vite', 'en-US');
    const r = await first;
    expect(r.hits).toEqual([]);
    expect(r.superseded).toBe(true);
  });

  it('(error) truyền error từ worker tới UI, KHÔNG nuốt mất (review #4)', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    const pending = c.search('vite', 'en-US');
    const [, m] = p.sent as Array<{ id: number }>;
    p.reply(m!.id, [], 'index 404');
    const r = await pending;
    expect(r.hits).toEqual([]);
    expect(r.error).toBe('index 404');
  });

  it('(review #3) dispose(): resolve {hits:[],superseded} cho truy vấn đang chờ, bỏ handler, VÀ terminate() port', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    const pending = c.search('vite', 'en-US');
    c.dispose();
    const r = await pending;
    expect(r.hits).toEqual([]);
    expect(p.port.onmessage).toBeNull();
    expect(p.terminate).toHaveBeenCalledTimes(1);
  });

  it('dispose() gọi hai lần không terminate() hai lần', () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    c.dispose();
    c.dispose();
    expect(p.terminate).toHaveBeenCalledTimes(1);
  });

  it('(review #5) đổi locale giữa 2 lần search() gửi message dropLocale cho locale CŨ', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    c.search('a', 'en-US');
    p.reply((p.sent[1] as { id: number }).id, []);
    c.search('b', 'vi-VN');
    expect(p.sent).toContainEqual({ type: 'dropLocale', locale: 'en-US' });
  });

  it('không đổi locale -> không gửi dropLocale nào', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    c.search('a', 'en-US');
    p.reply((p.sent[1] as { id: number }).id, []);
    const second = c.search('b', 'en-US');
    p.reply((p.sent[2] as { id: number }).id, []);
    await second;
    expect(p.sent.some((m) => m.type === 'dropLocale')).toBe(false);
  });

  it('nối SearchClient với SearchCore qua port đồng bộ (bắt lệch protocol init/search/dropLocale)', async () => {
    const core = new SearchCore(manifest, fakeFetch({ '/search-index/en-US.json': INDEX_EN }).fn);
    let clientHandler: SearchPortMessageHandler = null;
    const port: SearchPort = {
      postMessage: (m) => {
        if (m.type === 'search') {
          void core.search(m.query, m.locale).then((r) => clientHandler?.({ data: { id: m.id, hits: r.hits, error: r.error } }));
        } else if (m.type === 'dropLocale') {
          core.dropLocale(m.locale);
        }
      },
      get onmessage() { return clientHandler; },
      set onmessage(h) { clientHandler = h; },
    };
    const c = new SearchClient(port, manifest);
    const r = await c.search('vite', 'en-US');
    expect(r.hits.map((h) => h.routeId)).toContain('a');
  });
});
