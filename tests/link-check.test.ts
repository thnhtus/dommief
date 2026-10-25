import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { check, collect, formatIssues, type LinkRef } from '../packages/core/src/link-check.ts';

// Đặc tả: docs/backlog/DM-410.md "Tiêu chí chấp nhận" #1 (8 ca a-h).
// `outDir` mô phỏng thư mục build xong (không phải `public/` nguồn): asset tĩnh được Vite
// copy thẳng vào gốc `outDir` sau khi build.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-linkcheck-'));
fs.writeFileSync(path.join(outDir, 'logo.png'), '');
afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

const byPath = { '/guide/intro': { path: '/guide/intro' }, '/': { path: '/' } };
const tocByRoute = { '/guide/intro': [{ id: 'co-that', depth: 1, title: 'x' }] };
const baseOpts = { byPath, tocByRoute, base: '/', outDir };

const ref = (href: string, routeId = 'home', line = '1'): LinkRef => ({ href, routeId, file: 'docs/index.md', line });

describe('link-check (DM-410)', () => {
  it('(a) link /guide/intro có route → không lỗi', () => {
    expect(check([ref('/guide/intro')], baseOpts)).toEqual([]);
  });

  it('(b) /guide/nope → link_target_missing với file+line đúng', () => {
    const r = ref('/guide/nope', 'home', '42');
    const issues = check([r], baseOpts);
    expect(issues).toEqual([{ code: 'link_target_missing', ref: r }]);
  });

  it('(c) anchor: #khong-co → link_anchor_missing; #co-that → OK', () => {
    expect(check([ref('/guide/intro#khong-co')], baseOpts).map((i) => i.code)).toEqual(['link_anchor_missing']);
    expect(check([ref('/guide/intro#co-that')], baseOpts)).toEqual([]);
  });

  it('(d) https/mailto/protocol-relative/local-anchor → không lỗi (bị collect() lọc ngay, không tới check())', () => {
    const html = '<a href="https://x.dev/y">x</a><a href="mailto:a@b">m</a><img src="//cdn/x.png"><a href="#local-anchor">l</a>';
    expect(collect('home', html, 'docs/index.md')).toEqual([]);
  });

  it('(e) base /sub/: /sub/guide/intro OK; /guide/intro cũng OK; /sub/sub/guide/intro lỗi (không idempotent 2 lần)', () => {
    const opts = { ...baseOpts, base: '/sub/' };
    expect(check([ref('/sub/guide/intro')], opts)).toEqual([]);
    expect(check([ref('/guide/intro')], opts)).toEqual([]);
    expect(check([ref('/sub/sub/guide/intro')], opts).map((i) => i.code)).toEqual(['link_target_missing']);
  });

  it('(f) asset /logo.png có trong public/ → OK; /missing.png → link_asset_missing', () => {
    expect(check([ref('/logo.png')], baseOpts)).toEqual([]);
    expect(check([ref('/missing.png')], baseOpts).map((i) => i.code)).toEqual(['link_asset_missing']);
  });

  it('(g) 25 lỗi → output đúng 20 dòng + "… và 5 lỗi nữa"', () => {
    const issues = Array.from({ length: 25 }, (_, i) => ({ code: 'link_target_missing' as const, ref: ref(`/nope-${i}`) }));
    const out = formatIssues(issues);
    const lines = out.split('\n');
    expect(lines).toHaveLength(21);
    expect(lines.at(-1)).toBe('… và 5 lỗi nữa');
  });

  it('(h) anchor trên route bị ssg.exclude (không có toc) → không kiểm, không lỗi', () => {
    const opts = { ...baseOpts, tocByRoute: {} };
    expect(check([ref('/guide/intro#bat-ky-gi')], opts)).toEqual([]);
  });

  it('collect() đọc được data-src-line do rehypeLink gắn', () => {
    const html = '<a href="/guide/nope" data-src-line="7">x</a>';
    const refs = collect('home', html, 'docs/index.md');
    expect(refs).toEqual([{ href: '/guide/nope', routeId: 'home', file: 'docs/index.md', line: '7' }]);
  });

  it('href không có data-src-line (raw HTML nhúng tay) → line "—"', () => {
    const refs = collect('home', '<a href="/guide/nope">x</a>', 'docs/index.md');
    expect(refs[0]!.line).toBe('—');
  });
});
