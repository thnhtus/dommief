import { describe, expect, it } from 'vitest';
import { planRoutes, matchesAny, formatTimings } from '../packages/core/src/build.ts';
import { resolveConfig } from '../packages/core/src/config.ts';
import type { Route } from '../packages/core/src/types.ts';

const r = (p: string): Route => ({ id: p, path: p, file: `/x${p}.md` });

describe('planRoutes (REVIEW §1 #17)', () => {
  const routes = [r('/'), r('/guide'), r('/~demos/a'), r('/~demos/b'), r('/hidden')];
  it('exclude ⇒ không prerender nhưng VẪN phát shell; noEmit ⇒ bỏ hẳn', () => {
    const plan = planRoutes(routes, { exclude: ['/~demos/*'], noEmit: ['/hidden'] });
    expect(plan.prerender.map((x) => x.path)).toEqual(['/', '/guide']);
    expect(plan.shell.map((x) => x.path)).toEqual(['/~demos/a', '/~demos/b']);
  });
  it('mặc định mọi route được prerender', () => {
    expect(planRoutes(routes, { exclude: [], noEmit: [] }).prerender).toHaveLength(5);
  });
  it('pattern /prefix/* khớp chính prefix và con, không khớp tiền tố chữ cái', () => {
    expect(matchesAny('/a', ['/a/*'])).toBe(true);
    expect(matchesAny('/a/b', ['/a/*'])).toBe(true);
    expect(matchesAny('/ab', ['/a/*'])).toBe(false);
  });
});

describe('config mới', () => {
  const cwd = '/tmp/x';
  it('default + --no-cache / --no-link-check ghi đè file', () => {
    const d = resolveConfig({}, { cwd });
    expect([d.cache, d.linkCheck, d.dev.port, d.ssg.exclude]).toEqual([true, true, 5173, []]);
    const c = resolveConfig({ cache: true }, { cwd, cli: { cache: false, linkCheck: false } });
    expect([c.cache, c.linkCheck]).toEqual([false, false]);
  });
  it('sitemap.hostname phải là URL', () => {
    expect(() => resolveConfig({ sitemap: { hostname: 'nope' } }, { cwd })).toThrow(/config_invalid|không hợp lệ/);
  });
});

describe('formatTimings (DM-409 lát mỏng: cột %, luôn in)', () => {
  it('in từng khâu kèm % và tổng', () => {
    const s = formatTimings([{ stage: 'client', ms: 10 }, { stage: 'ssr', ms: 5 }]);
    expect(s).toContain('client');
    expect(s).toMatch(/client\s+0\.01s\s+67%/);
    expect(s).toMatch(/ssr\s+0\.01s\s+33%/);
    expect(s).toMatch(/total\s+0\.01s\s+100%/);
  });
  it('mảng rỗng -> không NaN/Infinity, % hiện —', () => {
    const s = formatTimings([]);
    expect(s).not.toMatch(/NaN|Infinity/);
    expect(s).toContain('—');
  });
});
