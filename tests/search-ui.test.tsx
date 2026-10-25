import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// @testing-library/react và `screen` đọc `document`/`window` NGAY LÚc IMPORT (không phải lúc
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
const { SiteProvider, SearchRuntimeProvider, SearchClient } = await import('../packages/core/src/theme-api.tsx');
const { SearchBox } = await import('../packages/theme-default/src/slots/SearchBox.tsx');
import type { SearchPort, SearchHit } from '../packages/core/src/theme-api.tsx';
import type { SearchWorkerInbound, SearchWorkerResponse } from '../packages/core/src/client/search-worker.ts';

// Đặc tả: DM-803 tiêu chí 1(a)-(f), 2, 4. Dùng SearchRuntimeProvider để tiêm một SearchClient nối
// thẳng vào mock đồng bộ — KHÔNG spawn Worker thật (jsdom không có Worker, xem review Q2 ở DM-802:
// nếu không tiêm được, mọi test "gõ -> thấy kết quả" sẽ xanh giả vì search() luôn trả []).

function hit(over: Partial<SearchHit>): SearchHit {
  return {
    id: 'id', routeId: 'r', path: '/r', pageTitle: 'Page', sectionTitle: 'Section',
    pageKey: 'r', sectionKey: 'r::0', score: 1, value: 'value', highlight: null, ...over,
  };
}

function fakePort(onSearch: (query: string, locale: string) => SearchHit[]): SearchPort {
  let handler: ((ev: { data: SearchWorkerResponse }) => void) | null = null;
  return {
    postMessage: (m: SearchWorkerInbound) => {
      if (m.type === 'search') {
        queueMicrotask(() => handler?.({ data: { id: m.id, hits: onSearch(m.query, m.locale), error: undefined } }));
      }
    },
    get onmessage() { return handler; },
    set onmessage(h) { handler = h; },
    terminate: () => {},
  };
}

/** `useNavigate()` được SearchBox gọi thật qua `MemoryRouter` (không mock `react-router`): mock
 * bằng `vi.doMock` KHÔNG áp dụng được vì `MemoryRouter`/`useLocation` đã được `import` tĩnh
 * (top-level `await import`) trước khi hàm này chạy — bắt trực tiếp: navigate spy không bao
 * giờ được gọi. Thay vào đó render một component con đọc `useLocation()` thiệt và ghi
 * lại path mỗi lần đổi — kiểm đúng điều người dùng quan tâm (URL thực sự đổi), không
 * phải chi tiết triển khai (gọi `navigate` với tham số gì). */
function LocationSpy({ onChange }: { onChange: (path: string) => void }) {
  const loc = useLocation();
  onChange(loc.pathname + loc.hash);
  return null;
}

function renderSearchBox(onSearch: (query: string, locale: string) => SearchHit[]) {
  const runtime = { createClient: async () => new SearchClient(fakePort(onSearch), { locales: { 'en-US': '/i.json' } }) };
  const site = { base: '/', title: 't', locales: [{ id: 'en-US', name: 'en', base: '/', suffix: '' }], themeConfig: {}, routes: {}, meta: {}, nav: {}, sidebar: {} };
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
    renderSearchBox(() => [hit({ id: 'a', sectionKey: 'a::0' })]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vite' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(1));
  });

  it('(b) kết quả group theo trang: số group = số trang khớp (dedupe theo section)', async () => {
    renderSearchBox(() => [
      hit({ id: 'a1', routeId: 'pageA', pageKey: 'pageA', sectionKey: 'pageA::0' }),
      hit({ id: 'a2', routeId: 'pageA', pageKey: 'pageA', sectionKey: 'pageA::1' }),
      hit({ id: 'b1', routeId: 'pageB', pageKey: 'pageB', sectionKey: 'pageB::0' }),
    ]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3));
    expect(screen.getAllByRole('group').length).toBe(2);
  });

  it('dedupe: nhiều hit cùng sectionKey chỉ hiện MỘT option (bug bắt được khi kiểm tay trình duyệt thật)', async () => {
    renderSearchBox(() => [
      hit({ id: 'd1', sectionKey: 'r::0', score: 1, highlight: null }),
      hit({ id: 'd2', sectionKey: 'r::0', score: 5, highlight: { start: 0, end: 1 } }),
      hit({ id: 'd3', sectionKey: 'r::0', score: 9, highlight: null }),
    ]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(1));
    // Ưu tiên hit có highlight thật dù score thấp hơn hit không highlight.
    expect(screen.getByRole('option').querySelector('mark')).toBeTruthy();
  });

  it('(c) ArrowDown di chuyển selection và aria-activedescendant cập nhật', async () => {
    renderSearchBox(() => [
      hit({ id: 'a', sectionKey: 'a::0' }),
      hit({ id: 'b', sectionKey: 'b::0' }),
    ]);
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

  it('(d) Enter điều hướng tới path đúng (kiểm qua location thật của MemoryRouter)', async () => {
    const { paths } = renderSearchBox(() => [hit({ id: 'a', path: '/guide/x', sectionKey: 'a::0' })]);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(1));
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(paths[paths.length - 1]).toBe('/guide/x'));
  });

  it('(e) Escape đóng dropdown và focus trở lại input', async () => {
    renderSearchBox(() => [hit({ id: 'a', sectionKey: 'a::0' })]);
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.change(input, { target: { value: 'x' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(1));
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('(f) không có kết quả -> thông điệp "không tìm thấy", không crash', async () => {
    renderSearchBox(() => []);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText('Không tìm thấy kết quả')).toBeTruthy());
  });

  it('error từ worker -> thông điệp an toàn, không crash, không hiện "không tìm thấy"', async () => {
    const runtime = {
      createClient: async () => new SearchClient({
        postMessage: (m: SearchWorkerInbound) => { if (m.type === 'search') queueMicrotask(() => { (runtimePort.onmessage)?.({ data: { id: m.id, hits: [], error: 'boom' } }); }); },
        get onmessage() { return runtimePort.onmessage; },
        set onmessage(h) { runtimePort.onmessage = h; },
      } as SearchPort, { locales: { 'en-US': '/i.json' } }),
    };
    const runtimePort: { onmessage: ((ev: { data: SearchWorkerResponse }) => void) | null } = { onmessage: null };
    const site = { base: '/', title: 't', locales: [{ id: 'en-US', name: 'en', base: '/', suffix: '' }], themeConfig: {}, routes: {}, meta: {}, nav: {}, sidebar: {} };
    render(
      <MemoryRouter>
        <SiteProvider value={site as never}>
          <SearchRuntimeProvider value={runtime}>
            <SearchBox />
          </SearchRuntimeProvider>
        </SiteProvider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByText('Không tìm được — thử lại sau')).toBeTruthy());
    expect(screen.queryByText('Không tìm thấy kết quả')).toBeNull();
  });

  it('(2) highlight snippet chứa <mark> bao quanh từ khoá', async () => {
    renderSearchBox(() => [hit({ id: 'a', sectionKey: 'a::0', value: 'Hello world', highlight: { start: 6, end: 11 } })]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'world' } });
    await waitFor(() => expect(screen.getByRole('option').querySelector('mark')?.textContent).toBe('world'));
  });

  it('(4) không fetch index trước khi người dùng gõ (role=search có mặt ngay, listbox thì không)', () => {
    const onSearch = vi.fn(() => []);
    renderSearchBox(onSearch);
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('role="search" và aria-label có mặt (accessibility tối thiểu)', () => {
    renderSearchBox(() => []);
    expect(screen.getByRole('search')).toHaveAttribute('aria-label');
  });

  it('site.search.enabled === false -> không render gì', () => {
    const site = { base: '/', title: 't', locales: [], themeConfig: {}, routes: {}, meta: {}, nav: {}, sidebar: {}, search: { enabled: false } };
    render(
      <MemoryRouter>
        <SiteProvider value={site as never}>
          <SearchBox />
        </SiteProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('search')).toBeNull();
  });
});
