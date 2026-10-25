import { describe, expect, it } from 'vitest';
import MiniSearch from 'minisearch';
import { SearchCore, findHighlightRange, type FetchText } from '../packages/core/src/client/search-core.ts';
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

  it('(4) highlight trỏ đúng vị trí từ khoá trong value gốc', async () => {
    const core = new SearchCore(manifest, fakeFetch({ '/search-index/en-US.json': INDEX_EN }).fn);
    const r = await core.search('bundler', 'en-US');
    const hit = r.hits.find((h) => h.routeId === 'a')!;
    expect(hit.highlight).not.toBeNull();
    expect(hit.value.slice(hit.highlight!.start, hit.highlight!.end).toLowerCase()).toBe('bundler');
  });

  it('findHighlightRange: không phân biệt hoa/thường, không thấy -> null', () => {
    expect(findHighlightRange('Hello World', 'world')).toEqual({ start: 6, end: 11 });
    expect(findHighlightRange('Hello', 'xyz')).toBeNull();
    expect(findHighlightRange('Hello', '  ')).toBeNull();
  });
});

// Fake port: ghi lại message gửi đi; test chủ động `reply()` để mô phỏng thứ tự trả lời của worker.
function fakePort() {
  const sent: SearchWorkerInbound[] = [];
  let handler: SearchPortMessageHandler = null;
  const port: SearchPort = {
    postMessage: (m) => { sent.push(m); },
    get onmessage() { return handler; },
    set onmessage(h) { handler = h; },
  };
  return { port, sent, reply: (id: number, hits: unknown[] = []) => handler?.({ data: { id, hits, error: undefined } }) };
}

describe('SearchClient (DM-802)', () => {
  it('gửi init với manifest ngay khi tạo, KHÔNG gửi search nào (lazy)', () => {
    const p = fakePort();
    new SearchClient(p.port, manifest);
    expect(p.sent).toEqual([{ type: 'init', manifest }]);
  });

  it('(c) truy vấn rỗng -> [] ngay, không postMessage', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    expect(await c.search('  ', 'en-US')).toEqual([]);
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
    expect(await second).toEqual([{ routeId: 'new' }]);
    expect(await first).toEqual([]); // bị thay thế -> resolve [] ngay, không treo
  });

  it('(d2) truy vấn cũ không treo Promise dù worker KHÔNG BAO GIỜ trả lời nó', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    const first = c.search('vi', 'en-US');
    c.search('vite', 'en-US');
    await expect(first).resolves.toEqual([]);
  });

  it('dispose: resolve [] cho truy vấn đang chờ và bỏ handler', async () => {
    const p = fakePort();
    const c = new SearchClient(p.port, manifest);
    const pending = c.search('vite', 'en-US');
    c.dispose();
    await expect(pending).resolves.toEqual([]);
    expect(p.port.onmessage).toBeNull();
  });

  it('nối SearchClient với SearchCore qua port đồng bộ (bắt lệch protocol init/search)', async () => {
    const core = new SearchCore(manifest, fakeFetch({ '/search-index/en-US.json': INDEX_EN }).fn);
    let clientHandler: SearchPortMessageHandler = null;
    const port: SearchPort = {
      postMessage: (m) => {
        if (m.type === 'search') {
          void core.search(m.query, m.locale).then((r) => clientHandler?.({ data: { id: m.id, hits: r.hits, error: r.error } }));
        }
      },
      get onmessage() { return clientHandler; },
      set onmessage(h) { clientHandler = h; },
    };
    const c = new SearchClient(port, manifest);
    const hits = await c.search('vite', 'en-US');
    expect(hits.map((h) => h.routeId)).toContain('a');
  });
});
