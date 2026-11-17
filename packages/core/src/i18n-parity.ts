import { matchExclude } from './exclude.js';
import type { RouteTable } from './types.js';

// DM-916: key đã dịch một phần (có ở ≥1 locale nhưng không đủ mọi locale) → cảnh báo gom nhóm.
// Key chỉ có 1 locale là cố ý nếu khớp `i18n.allowSingleLocale`; site 1 locale không kiểm tra.

const MAX_SHOWN = 20;

export interface ParityIssue { key: string; missing: string[] }

export function findParityIssues(table: RouteTable, localeIds: string[], allowSingleLocale: string[]): ParityIssue[] {
  if (localeIds.length < 2) return [];
  // Chấp nhận cả 'reference/**' và '/reference/**' (pattern luôn khớp trên path có '/' đầu).
  const allow = allowSingleLocale.map((p) => (p.startsWith('/') ? p : '/' + p));
  const issues: ParityIssue[] = [];
  for (const [key, byLocale] of Object.entries(table.byKey)) {
    const present = Object.keys(byLocale);
    if (present.length === localeIds.length) continue;
    if (present.length === 1 && matchExclude(key === '' ? '/' : '/' + key, allow)) continue;
    issues.push({ key, missing: localeIds.filter((l) => !byLocale[l]) });
  }
  return issues;
}

/** Một dòng cảnh báo: "Missing translations for N keys: key (vi-VN); ... (+M more)". */
export function formatParityWarning(issues: ParityIssue[]): string | undefined {
  if (!issues.length) return undefined;
  const shown = issues.slice(0, MAX_SHOWN).map((i) => `${i.key || '/'} (${i.missing.join(', ')})`);
  const more = issues.length > MAX_SHOWN ? `; ... ${issues.length - MAX_SHOWN} more` : '';
  return `Missing translations for ${issues.length} keys: ${shown.join('; ')}${more}`;
}
