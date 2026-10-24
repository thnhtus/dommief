import { describe, expect, it } from 'vitest';
import { transformMarkdown } from '../packages/core/src/markdown/index.ts';
import { buildSearchIndex } from '../packages/core/src/search.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import MiniSearch from 'minisearch';

describe('search index', () => {
  it('builds per locale and is queryable', async () => {
    const md = '# Hello\n\nTiếng Việt content here.\n';
    const meta = (await transformMarkdown(md, 'a.md')).meta;
    const routes: any[] = [{ id: 'a', path: '/a', file: 'a.md' }];
    const res: any = await buildSearchIndex({
      routes,
      loadPageMeta: async () => meta,
      config: { locales: [{ id: 'en-US', name: 'English', base: '/', suffix: '' }] },
    });
    expect(res.locales['en-US']).toBeTruthy();
    // reconstruct with config from module
    const { createMiniSearchConfig } = await import('../packages/core/src/search.ts');
    const cfg = createMiniSearchConfig();
    const ms2 = MiniSearch.loadJSON(JSON.stringify(res.locales['en-US']), { fields: ['value','pageTitle','sectionTitle'], storeFields: ['routeId','path','pageTitle','sectionTitle','paraId','value','pageKey','sectionKey'], ...cfg } as any);
    const hits = ms2.search('tieng');
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('tokenizer (#14)', () => {
  it('bỏ dấu câu cuối từ và đổi đ→d', async () => {
    const { createMiniSearchConfig } = await import('../packages/core/src/search.ts');
    const ms = new MiniSearch({ fields: ['v'], ...createMiniSearchConfig() } as any);
    ms.addAll([{ id: 1, v: 'Tiếng Việt content here.' }, { id: 2, v: 'Đà Nẵng' }]);
    expect(ms.search('here').length).toBe(1);
    expect(ms.search('da nang').length).toBe(1);
  });
});
