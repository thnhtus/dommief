import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// @testing-library/react và `screen` đọc `document`/`window` NGAY LÚC IMPORT (không phải lúc
// gọi `render()`) — bắt trực tiếp: file này chạy trong vitest environment `node` mặc định
// của repo (không `jsdom`), nên phải tự dựng DOM TRƯỚC mọi import React/testing-library,
// giống đúng pattern đã dùng ở tests/hydrate-ssr.test.tsx.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });

const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
// Không dùng vitest environment `jsdom` built-in (tự dựng DOM thủ công như trên) nên
// auto-cleanup của @testing-library/react (dựa vào lifecycle của môi trường đó) KHÔNG chạy
// — bắt trực tiếp: mỗi `render()` ở test sau tích luỹ DOM của test trước, `getByRole`
// báo "found multiple elements". Phải tự gọi `cleanup()`.
afterEach(cleanup);
await import('@testing-library/jest-dom/vitest');
const { MemoryRouter, Routes, Route, useLocation } = await import('react-router');
const { SiteProvider, SearchRuntimeProvider } = await import('../packages/core/src/theme-api.tsx');
const { SearchBox } = await import('../packages/theme-default/src/slots/SearchBox.tsx');
import type { SearchRuntime, SearchHit, SearchResult } from '../packages/core/src/theme-api.tsx';

// Đặc tả: DM-803 tiêu chí 1(a)-(f), 2, 4. Dùng SearchRuntimeProvider để tiêm một SearchRuntime
// giả (chỉ { search, dispose? } — KHÔNG phải SearchClient/SearchPort nội bộ, xem review Q2
// DM-803: những type đó không public) — KHÔNG spawn Worker thật (jsdom không có Worker; nếu
// không tiêm được, mọi test "gõ -> thấy kết quả" sẽ xanh giả vì search() luôn trả []).

function hit(over: Partial<SearchHit>): SearchHit {
  return {
    id: 'id', routeId: 'r', path: '/r', pageTitle: 'Page', sectionTitle: 'Section',
    pageKey: 'r', sectionKey: 'r::0', score: 1, value: 'value', highlight: null, ...over,
  };
}

function fakeRuntime(onSearch: (query: string, locale: string) => SearchHit[]): SearchRuntime {
  return { search: async (q, l) => ({ hits: onSearch(q, l) }) };
}

/** `useNavigate()` được SearchBox gọi thật qua `MemoryRouter` (không mock `react-router`): mock
 * bằng `vi.doMock` KHÔNG áp dụng được vì `MemoryRouter`/`useLocation` đã được `import` tĩnh
 * (top-level `await import`) trước khi hàm này chạy — bắt trực tiếp: navigate spy không bao
 * giờ được gọi. Thay vào đó render một component con đọc `useLocation()` thật và ghi
 * lại path mỗi lần đổi — kiểm đúng điều người dùng quan tâm (URL thực sự đổi), không
 * phải chi tiết triển khai (gọi `navigate` với tham số gì). */
function LocationSpy({ onChange }: { onChange: (path: string) => void }) {
  const loc = useLocation();
  onChange(loc.pathname + loc.hash);
  return null;
}

interface Site { base: string; title: string; locales: unknown[]; themeConfig: object; routes: object; meta: object; nav: object; sidebar: object; search?: { enabled: boolean } }
const defaultSite: Site = { base: '/', title: 't', locales: [{ id: 'en-US', name: 'en', base: '/', suffix: '' }], themeConfig: {}, routes: {}, meta: {}, nav: {}, sidebar: {} };

function renderSearchBox(runtime: SearchRuntime, site: Site = defaultSite) {
  const paths: string[] = [];
  render(
    <MemoryRouter initialEntries={['/']}>
      <SiteProvider value={site as never}>
        <SearchRuntimeProvider value={runtime}>
          <SearchBox />
          <Routes>
            <Route path="*" element={<LocationSpy onChange={(p) => paths.push(p)} />} />
          </Routes>
        </SearchRuntimeProvider>
      </SiteProvider>
    </MemoryRouter>,
  );
  return { paths };
}

describe('SearchBox (DM-803)', () => {
  it('(a) gõ từ khoá -> sau debounce hiển thị >= 1 kết quả đúng', async () => {
    renderSearchBox(fakeRuntime(() => [hit({ id: 'a', sectionKey: 'a::0' })]));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vite' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(1));
  });

  it('(b) kết quả group theo trang: số group = số trang khớp (dedupe theo section)', async () => {
    renderSearchBox(fakeRuntime(() => [
      hit({ id: 'a1', routeId: 'pageA', pageKey: 'pageA', sectionKey: 'pageA::0' }),
      hit({ id: 'a2', routeId: 'pageA', pageKey: 'pageA', sectionKey: 'pageA::1' }),
      hit({ id: 'b1', routeId: 'pageB', pageKey: 'pageB', sectionKey: 'pageB::0' }),
    ]));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3));
    expect(screen.getAllByRole('group').length).toBe(2);
  });

  it('dedupe: nhiều hit cùng sectionKey -> tối đa 3 option, ưu tiên hit có highlight thật (bug bắt được khi kiểm tay trình duyệt thật)', async () => {
    renderSearchBox(fakeRuntime(() => [
      hit({ id: 'd1', sectionKey: 'r::0', score: 1, highlight: null }),
      hit({ id: 'd2', sectionKey: 'r::0', score: 5, highlight: { start: 0, end: 1 } }),
      hit({ id: 'd3', sectionKey: 'r::0', score: 9, highlight: null }),
      hit({ id: 'd4', sectionKey: 'r::0', score: 8, highlight: null }),
    ]));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3)); // MAX_HITS_PER_SECTION, không phải 1 và không phải 4.
    // Hit có highlight thật phải đứng trước dù điểm thấp hơn.
    expect(screen.getAllByRole('option')[0]!.querySelector('mark')).toBeTruthy();
  });

  it('(c) ArrowDown di chuyển selection và aria-activedescendant cập nhật', async () => {
    renderSearchBox(fakeRuntime(() => [
      hit({ id: 'a', sectionKey: 'a::0' }),
      hit({ id: 'b', sectionKey: 'b::0' }),
    ]));
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(2));
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const firstId = screen.getAllByRole('option')[0]!.id;
    expect(input.getAttribute('aria-activedescendant')).toBe(firstId);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const secondId = screen.getAllByRole('option')[1]!.id;
    expect(input.getAttribute('aria-activedescendant')).toBe(secondId);
  });

  it('(d) Enter điều hướng tới path đúng (kiểm qua location thật của MemoryRouter), và reset ô nhập sau khi điều hướng', async () => {
    const { paths } = renderSearchBox(fakeRuntime(() => [hit({ id: 'a', path: '/guide/x', sectionKey: 'a::0' })]));
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(1));
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(paths[paths.length - 1]).toBe('/guide/x'));
    // Review Q4: query/kết quả cũ không được còn lại — focus lại input sau điều hướng không
    // được tự bật lại danh sách cũ.
    expect(input.value).toBe('');
    fireEvent.focus(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('(e) Escape đóng dropdown và focus trở lại input', async () => {
    renderSearchBox(fakeRuntime(() => [hit({ id: 'a', sectionKey: 'a::0' })]));
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(1));
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('(f) không có kết quả -> thông điệp "không tìm thấy", không crash', async () => {
    renderSearchBox(fakeRuntime(() => []));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText('Không tìm thấy kết quả')).toBeTruthy());
  });

  it('error từ worker -> thông điệp an toàn, không crash, không hiện "không tìm thấy"', async () => {
    const runtime: SearchRuntime = { search: async (): Promise<SearchResult> => ({ hits: [], error: 'boom' }) };
    renderSearchBox(runtime);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByText('Không tìm được — thử lại sau')).toBeTruthy());
    expect(screen.queryByText('Không tìm thấy kết quả')).toBeNull();
  });

  it('(2) highlight snippet chứa <mark> bao quanh từ khoá', async () => {
    renderSearchBox(fakeRuntime(() => [hit({ id: 'a', sectionKey: 'a::0', value: 'Hello world', highlight: { start: 6, end: 11 } })]));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'world' } });
    await waitFor(() => expect(screen.getByRole('option').querySelector('mark')?.textContent).toBe('world'));
  });

  it('(4) không fetch index trước khi người dùng gõ (role=search có mặt ngay, listbox thì không)', () => {
    const onSearch = vi.fn(() => []);
    renderSearchBox(fakeRuntime(onSearch));
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('role="search" và aria-label có mặt (accessibility tối thiểu)', () => {
    renderSearchBox(fakeRuntime(() => []));
    expect(screen.getByRole('search')).toHaveAttribute('aria-label');
  });

  it('(review #1) aria-expanded/aria-controls KHÔNG trỏ vào id không tồn tại ở trạng thái loading/empty/error', async () => {
    // Runtime không bao giờ resolve (giữ status='loading' mãi) để bắt trạng thái trung gian.
    const never = new Promise<SearchResult>(() => {});
    renderSearchBox({ search: async () => never });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'x' } });
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
    expect(input).not.toHaveAttribute('aria-controls');
  });

  it('(review #2) aria-live báo số lượng kết quả, không announce "Đang tìm…" khi đã có kết quả', async () => {
    renderSearchBox(fakeRuntime(() => [hit({ id: 'a', sectionKey: 'a::0' }), hit({ id: 'b', sectionKey: 'b::0' })]));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByText('2 kết quả')).toBeTruthy());
  });

  it('site.search.enabled === false -> không render gì', () => {
    renderSearchBox(fakeRuntime(() => []), { ...defaultSite, locales: [], search: { enabled: false } });
    expect(screen.queryByRole('search')).toBeNull();
  });
});

// (review #7) Build THẬT fixture nhiều heading, lấy search index THẬT + site module THẬT, xác
// nhận sectionKey (từ search-index, pipeline transformMarkdown) và site.meta[].toc (từ
// extractPageSummary, parser KHÁC) đồng bộ chỉ số — nếu hai mảng toc lệch thứ tự/độ dài,
// SearchBox.go() sẽ trỏ anchor sai heading. Dùng build pipeline thật, không mock.
describe('SearchBox (DM-803) — tocIndex đồng bộ giữa search-index và site.meta (review #7)', () => {
  it('nhiều heading: anchor suy từ sectionKey khớp đúng id heading thật trong HTML đã build', async () => {
    const { createSite } = await import('./helpers/fixture-site.ts');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const s = createSite('search-toc-sync');
    fs.writeFileSync(
      path.join(s.dir, 'docs', 'many-headings.md'),
      [
        '# Many headings',
        '',
        'Intro-marker paragraph.',
        '',
        '## Second heading',
        '',
        'Second-marker paragraph unique text here.',
        '',
        '## Third heading',
        '',
        'Third-marker paragraph unique text here.',
        '',
        '### Fourth heading',
        '',
        'Fourth-marker paragraph unique text here.',
        '',
      ].join('\n'),
    );
    s.build();
    try {
      const html = s.read('many-headings/index.html');
      // id thật mà rehypeSlug gắn vào HTML đã build cho từng heading.
      const idOf = (title: string) => {
        const m = new RegExp(`id="([a-z0-9-]+)"[^>]*>\\s*<a[^>]*class="dommief-heading-anchor"[^>]*></a>${title}`).exec(html)
          ?? new RegExp(`<h[1-6][^>]*id="([a-z0-9-]+)"[^>]*>.*?${title}`, 's').exec(html);
        expect(m, `không tìm thấy heading "${title}" trong HTML đã build`).toBeTruthy();
        return m![1]!;
      };
      const thirdHeadingId = idOf('Third heading');
      const fourthHeadingId = idOf('Fourth heading');

      const indexJson = JSON.parse(fs.readFileSync(path.join(s.dist, 'search-index', 'en-US.json'), 'utf8'));
      const siteModule = (await import(path.join(s.dir, '.dommief', 'server', 'server.mjs') + `?t=${Date.now()}`)) as any;
      const site = siteModule.site ?? siteModule.default?.site;
      const routeId = Object.keys(site.routes).find((id: string) => id.includes('many-headings'));
      expect(routeId).toBeTruthy();

      // Tìm trong search index đúng document chứa "Third-marker" -> lấy sectionKey -> suy tocIndex
      // -> tra site.meta[routeId].toc[tocIndex] -> PHẢI khớp đúng id heading "Third heading" thật.
      const { createMiniSearchConfig, SEARCH_FIELDS, SEARCH_STORE_FIELDS } = await import('../packages/core/src/search-config.ts');
      const MiniSearch = (await import('minisearch')).default;
      const ms = MiniSearch.loadJSON(JSON.stringify(indexJson), { fields: [...SEARCH_FIELDS], storeFields: [...SEARCH_STORE_FIELDS], ...createMiniSearchConfig() } as any);
      const hits = ms.search('third-marker unique', { prefix: true });
      const hit = hits.find((h: any) => h.routeId === routeId);
      expect(hit, 'không tìm thấy "Third-marker" trong search index thật').toBeTruthy();
      const m = /::(\d+)$/.exec(hit!.sectionKey);
      expect(m, `sectionKey "${hit!.sectionKey}" không có dạng <routeId>::<tocIndex>`).toBeTruthy();
      const tocIndex = Number(m![1]);
      const resolvedAnchor = site.meta[routeId].toc[tocIndex]?.id;
      expect(resolvedAnchor, `site.meta[${routeId}].toc[${tocIndex}] không tồn tại`).toBeTruthy();
      expect(resolvedAnchor).toBe(thirdHeadingId);
      expect(resolvedAnchor).not.toBe(fourthHeadingId);
    } finally {
      s.cleanup();
    }
  }, 60_000);
});
