import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSiteData, useSiteSearch, type SearchHit } from 'dommief/theme-api';
import styles from '../styles/search.module.css';
import { buildSnippet } from './search-snippet.js';

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
 * trả 8 hàng cho 1 trang, snippet lần lượt là "a", "b", "1", "2"...). Giữ hit điểm cao nhất
 * MỖI `sectionKey`; ưu tiên hit có `highlight` thật (chứng tỏ khớp đúng trong nội dung,
 * không phải chỉ khớp qua field tiêu đề dùng chung).
 */
function groupHits(hits: SearchHit[]): Group[] {
  const bestBySection = new Map<string, SearchHit>();
  for (const hit of hits) {
    const prev = bestBySection.get(hit.sectionKey);
    const better = !prev || (hit.highlight && !prev.highlight) || (!!hit.highlight === !!prev.highlight && hit.score > prev.score);
    if (better) bestBySection.set(hit.sectionKey, hit);
  }
  const groups: Group[] = [];
  for (const hit of bestBySection.values()) {
    let g = groups.find((x) => x.pageKey === hit.pageKey);
    if (!g) { g = { pageKey: hit.pageKey, pageTitle: hit.pageTitle, hits: [] }; groups.push(g); }
    g.hits.push(hit);
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
  const latestQuery = useRef('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    latestQuery.current = query;
    if (!query.trim()) { setStatus('idle'); setHits([]); setActive(-1); return; }
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
  // Danh sách PHẳNG theo đúng thứ tự hiển thị (sau dedupe) — `active` PHẢI là index trong
  // danh sách này, KHÔNG phải index trong `hits` gốc: bắt trực tiếp bằng kiểm tay — trước
  // khi sửa, `ArrowDown` tăng `active` modulo `hits.length` (trước dedupe) trong khi UI chỉ
  // render số hạng mục đã dedupe (ít hơn), nên nhiều lần nhấn không trúng option nào đang
  // hiển -> `aria-activedescendant` trỏ vào hư không, `Enter` không điều hướng được.
  const visible = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  if (site.search?.enabled === false) return null;

  const expanded = open && status !== 'idle';
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const go = (hit: SearchHit) => {
    const m = /::(\d+)$/.exec(hit.sectionKey);
    const anchor = m ? site.meta?.[hit.routeId]?.toc?.[Number(m[1])]?.id : undefined;
    navigate(hit.path + (anchor ? `#${anchor}` : ''));
    setOpen(false);
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

  const message =
    status === 'loading' ? 'Đang tìm…' :
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
        type="search"
        role="combobox"
        aria-label="Tìm kiếm"
        aria-expanded={expanded}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        {...(expanded && active >= 0 ? { 'aria-activedescendant': optionId(active) } : {})}
        autoComplete="off"
        placeholder="Tìm kiếm…"
        className={styles.input!}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <div aria-live="polite" className={styles.status!}>{expanded ? message : ''}</div>
      {expanded && status === 'results' ? (
        <div id={`${uid}-list`} role="listbox" aria-label="Kết quả tìm kiếm" className={styles.list!} onMouseDown={(e) => e.preventDefault()}>
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
