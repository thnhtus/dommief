import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSiteData, useSiteSearch, type SearchHit } from 'dommief/theme-api';
import styles from '../styles/search.module.css';
import { buildSnippet } from '../utils/search-snippet.js';

// DM-803. Ô nhập có debounce -> useSiteSearch (không gọi worker trực tiếp). role="search" +
// combobox/listbox/option + aria-activedescendant. Worker chỉ được tạo ở truy vấn đầu tiên
// (useSiteSearch lo), nên chưa gõ thì 0 request. Render đầu (SSR/hydrate) luôn là trạng thái đóng,
// không phụ thuộc client-only API => không hydration mismatch.
const DEBOUNCE_MS = 200;

type Status = 'idle' | 'loading' | 'results' | 'empty' | 'error';
interface Group { pageKey: string; pageTitle: string; hits: SearchHit[] }

/**
 * Nhóm theo trang rồi theo section (DM-803 scope). Mỗi `SearchDocument` là MỘT text fragment
 * (paragraph) — nếu MiniSearch khớp qua field `pageTitle` (đồng nhất với mọi fragment cùng
 * trang khi trang chưa có heading con), KHÔNG dedupe sẽ ra hàng chục "kết quả" trùng title
 * nhưng snippet vô nghĩa — bắt trực tiếp bằng kiểm tay trong trình duyệt thật (query "hello"
 * trả 8 hàng cho 1 trang, snippet lần lượt là "a", "b", "1", "2"...).
 *
 * Đây là band-aid ở tầng UI cho một vấn đề nằm ở tầng index (review): `pageTitle`/`sectionTitle`
 * nằm trong SEARCH_FIELDS nên MỌI fragment của section đều "khớp" khi query trúng tiêu đề. Sửa
 * đúng chỗ là đổi search-config.ts (tách field tiêu đề khỏi full-text, hoặc boost thấp hơn hẳn)
 * — đổi ở DM-801/804, không đổi ở đây để không phá contract index đã merge.
 *
 * Giữ TỐI ĐA 3 hit mỗi section (không phải 1): một section dài có thể có nhiều đoạn khớp thật,
 * giữ đúng 1 sẽ che mất chúng. Ưu tiên hit có `highlight` thật trước (bằng chứng khớp nội dung,
 * không chỉ khớp qua field tiêu đề dùng chung) — nhưng LƯU Ý: `highlight === null` cũng xảy ra
 * với khớp fuzzy hợp lệ (MiniSearch chạy `fuzzy: 0.2`, vd gõ sai một ký tự), không chỉ với khớp
 * giả qua title; đây là ưu tiên hiển thị, không phải bộ lọc đúng/sai.
 */
const MAX_HITS_PER_SECTION = 3;
function groupHits(hits: SearchHit[]): Group[] {
  const bySection = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const arr = bySection.get(hit.sectionKey) ?? [];
    arr.push(hit);
    bySection.set(hit.sectionKey, arr);
  }
  const groups: Group[] = [];
  for (const arr of bySection.values()) {
    const top = [...arr]
      .sort((a, b) => (b.highlight ? 1 : 0) - (a.highlight ? 1 : 0) || b.score - a.score)
      .slice(0, MAX_HITS_PER_SECTION);
    const first = top[0]!;
    let g = groups.find((x) => x.pageKey === first.pageKey);
    if (!g) { g = { pageKey: first.pageKey, pageTitle: first.pageTitle, hits: [] }; groups.push(g); }
    g.hits.push(...top);
  }
  return groups;
}

export function SearchBox() {
  const site = useSiteData();
  const { search } = useSiteSearch();
  const navigate = useNavigate();
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const latestQuery = useRef('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(-1);

  const reset = () => { setQuery(''); setHits([]); setStatus('idle'); setActive(-1); };
  // Khai báo TRƯỚC effect bên dưới dùng nó — chỉ phụ thuộc `uid` (không đổi qua các lần render),
  // eslint-plugin-react-hooks từng báo "accessed before declared" khi nó nằm sau effect mà dùng nó.
  const optionId = (i: number) => `${uid}-opt-${i}`;
  // Chỉ nhánh "query rỗng" là biết ngay lúc render (không phải trạng thái từ hệ thống ngoài) — dời
  // reset đó ra đây. `setStatus('loading')` KHI query không rỗng vẫn ở trong effect (giữ nguyên):
  // nó cũng chạy lại khi `search` đổi identity do đổi locale (điều hướng trang trong lúc đang
  // gõ dở) — đó là phản ứng với effect thật (kích tìm lại), không phải state tính được từ
  // render, nên eslint-plugin-react-hooks (`set-state-in-effect`) không gắn cờ nhánh này.
  const onQueryChange = (next: string) => {
    setQuery(next);
    setOpen(true);
    if (!next.trim()) { setStatus('idle'); setHits([]); setActive(-1); }
  };

  useEffect(() => {
    latestQuery.current = query;
    if (!query.trim()) return; // đã reset ở onQueryChange/reset() — không set state thêm ở đây
    // Cố ý: khi `search` đổi identity (điều hướng đổi locale trong lúc đang gõ dở), effect chạy
    // lại PHẢI bật lại 'loading' để kích tìm lại theo locale mới — không tính được từ render
    // (rule không phân biệt được lý do hợp lệ này với state đáng lẽ không cần effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading');
    const t = setTimeout(async () => {
      const res = await search(query);
      // Bỏ kết quả của truy vấn đã bị thay thế hoặc không còn là truy vấn hiện tại (không chớp "không tìm thấy").
      if (res.superseded || latestQuery.current !== query) return;
      if (res.error) { setStatus('error'); setHits([]); return; }
      setHits(res.hits);
      setActive(-1);
      setStatus(res.hits.length ? 'results' : 'empty');
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, search]);

  const groups = useMemo(() => groupHits(hits), [hits]);
  // Danh sách PHẲNG theo đúng thứ tự hiển thị (sau dedupe) — `active` PHẢI là index trong
  // danh sách này, KHÔNG phải index trong `hits` gốc: bắt trực tiếp bằng kiểm tay — trước
  // khi sửa, `ArrowDown` tăng `active` modulo `hits.length` (trước dedupe) trong khi UI chỉ
  // render số hạng mục đã dedupe (ít hơn), nên nhiều lần nhấn không trúng option nào đang
  // hiển -> `aria-activedescendant` trỏ vào hư không, `Enter` không điều hướng được.
  const visible = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  useEffect(() => {
    if (active < 0) return;
    const el = listRef.current?.querySelector(`#${CSS.escape(optionId(active))}`);
    el?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (site.search?.enabled === false) return null;

  // Listbox CHỈ tồn tại khi có k có kết quả thật (status === 'results') — `aria-expanded`/
  // `aria-controls` không được trỏ vào id của một phần tử KHÔNG render (review #1: trước đây
  // `expanded` bật ngay từ trạng thái 'loading', lúc đó chưa có `#${uid}-list` nào trong DOM —
  // defect a11y thật, axe/ARIA validator sẽ bắt `aria-controls` trỏ tới id không tồn tại).
  const hasListbox = status === 'results';
  const expanded = open && hasListbox;

  const go = (hit: SearchHit) => {
    const m = /::(\d+)$/.exec(hit.sectionKey);
    const anchor = m ? site.meta?.[hit.routeId]?.toc?.[Number(m[1])]?.id : undefined;
    navigate(hit.path + (anchor ? `#${anchor}` : ''));
    setOpen(false);
    reset(); // không để query/hits cũ còn lại — focus lại input sau khi điều hướng không được bật lại danh sách cũ.
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView?.());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && visible.length) {
      e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % visible.length);
    } else if (e.key === 'ArrowUp' && visible.length) {
      e.preventDefault(); setOpen(true); setActive((a) => (a <= 0 ? visible.length - 1 : a - 1));
    } else if (e.key === 'Enter' && expanded && active >= 0 && visible[active]) {
      e.preventDefault(); go(visible[active]!);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); setOpen(false); inputRef.current?.focus();
    }
  };

  // aria-live: CHỈ thông báo trạng thái "ổn định" (đã xong 1 vòng tìm) — không announce 'loading'
  // mỗi keystroke (review #2: mỗi phím gõ ghi vào live region rất ồn cho screen reader). Trạng
  // thái 'results' phải tự thông báo SỐ LƯỢNG — trước đây 'results' không có message nào, người
  // dùng screen reader nghe "Đang tìm…" rồi im lặng, không biết có bao nhiêu kết quả.
  const message =
    status === 'results' ? `${visible.length} kết quả` :
    status === 'empty' ? 'Không tìm thấy kết quả' :
    status === 'error' ? 'Không tìm được — thử lại sau' : '';

  return (
    <div
      role="search"
      aria-label="Tìm kiếm trong tài liệu"
      className={styles.search!}
      ref={rootRef}
      onBlur={(e) => { if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <input
        ref={inputRef}
        // `type="text"` (không phải "search"): APG combobox pattern dùng input text thuần —
        // `type="search"` thêm role ngầm `searchbox` xung đột với `role="combobox"` tường minh
        // và nút "clear" gốc của trình duyệt không đi qua React event, dễ gây lệch state (review Q3).
        type="text"
        role="combobox"
        aria-label="Tìm kiếm"
        aria-expanded={expanded}
        {...(hasListbox ? { 'aria-controls': `${uid}-list` } : {})}
        aria-autocomplete="list"
        {...(expanded && active >= 0 ? { 'aria-activedescendant': optionId(active) } : {})}
        autoComplete="off"
        placeholder="Tìm kiếm…"
        className={styles.input!}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <div aria-live="polite" className={styles.status!}>{open ? message : ''}</div>
      {expanded ? (
        <div
          ref={listRef}
          id={`${uid}-list`}
          role="listbox"
          aria-label="Kết quả tìm kiếm"
          className={styles.list!}
          // `onPointerDown` (không chỉ `onMouseDown`): bao cả chuột/bút/chạm, ngăn blur chạy
          // trước `onClick` của option khi người dùng chạm bằng ngón tay (review Q4).
          onPointerDown={(e) => e.preventDefault()}
        >
          {groups.map((g) => (
            <div key={g.pageKey} role="group" aria-labelledby={`${uid}-g-${g.pageKey}`}>
              <div id={`${uid}-g-${g.pageKey}`} className={styles.group!}>{g.pageTitle}</div>
              {g.hits.map((hit) => {
                const visibleIndex = visible.indexOf(hit);
                const s = buildSnippet(hit.value, hit.highlight);
                return (
                  <div
                    key={hit.id}
                    id={optionId(visibleIndex)}
                    role="option"
                    aria-selected={visibleIndex === active}
                    className={styles.option!}
                    onMouseEnter={() => setActive(visibleIndex)}
                    onClick={() => go(hit)}
                  >
                    <span className={styles.section!}>{hit.sectionTitle}</span>
                    <span className={styles.snippet!}>{s.before}{s.match ? <mark>{s.match}</mark> : null}{s.after}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
export default SearchBox;
