// DM-803: cắt snippet quanh vị trí khớp mà worker (DM-802) đã tính sẵn — UI KHÔNG tự tìm lại từ
// khoá trong chuỗi. Thuần (không React) để test trực tiếp.
export interface Snippet { before: string; match: string; after: string }

export function buildSnippet(value: string, highlight: { start: number; end: number } | null, max = 120): Snippet {
  if (!highlight) return { before: value.length > max ? value.slice(0, max) + '…' : value, match: '', after: '' };
  const { start, end } = highlight;
  const room = Math.max(0, max - (end - start));
  const from = Math.max(0, start - Math.floor(room / 2));
  const to = Math.min(value.length, end + Math.ceil(room / 2));
  return {
    before: (from > 0 ? '…' : '') + value.slice(from, start),
    match: value.slice(start, end),
    after: value.slice(end, to) + (to < value.length ? '…' : ''),
  };
}
