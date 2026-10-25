import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSite } from './helpers/fixture-site.ts';

// DM-409 (phần ngân sách): build fixture thật, đọc bảng thời gian từ stdout. Ngân sách RỘNG có chủ ý —
// chỉ bắt hồi quy lớn (vd prerender thành tuần tự theo trang, mất cache, một khâu phình gấp chục lần),
// không bắt dao động vài chục % giữa máy nhanh/chậm hay CI.
const s = createSite('budget');
const TOTAL_BUDGET_S = 30;
const STAGES = ['client', 'ssr', 'prerender', 'link-check', 'search-index', 'sitemap', 'plugins'];
let out = '';

function parse(text: string) {
  const rows = new Map<string, { sec: number; pct: number }>();
  for (const m of text.matchAll(/^\s+([\w-]+)\s+([\d.]+)s\s+(\d+)%\s*$/gm)) {
    rows.set(m[1]!, { sec: Number(m[2]), pct: Number(m[3]) });
  }
  return rows;
}

describe('build timings (DM-409)', () => {
  beforeAll(() => { out = s.build().toString(); }, 180_000);
  afterAll(() => s.cleanup());

  it('in bảng với đủ các khâu và dòng total', () => {
    const rows = parse(out);
    for (const st of [...STAGES, 'total']) expect(rows.has(st), `thiếu khâu "${st}" trong:\n${out}`).toBe(true);
  });

  it('phần trăm các khâu cộng lại ≈ 100 (làm tròn từng dòng nên cho lệch ±len)', () => {
    const rows = parse(out);
    const sum = STAGES.reduce((a, st) => a + (rows.get(st)?.pct ?? 0), 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(STAGES.length);
    expect(rows.get('total')?.pct).toBe(100);
  });

  it(`tổng thời gian build fixture < ${TOTAL_BUDGET_S}s`, () => {
    expect(parse(out).get('total')!.sec).toBeLessThan(TOTAL_BUDGET_S);
  });
});
