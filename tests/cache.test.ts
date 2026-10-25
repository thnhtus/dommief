import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashKey, stableStringify, computePipelineHash, TransformCache, CACHE_VERSION, type KeyInput } from '../packages/core/src/cache.ts';

// Đặc tả: docs/backlog/DM-406.md "Tiêu chí chấp nhận" #1 (7 ca a-g), theo Amendment payload {code, meta}.
const baseInput: KeyInput = { md: 'content', file: '/x.md', base: '/', routesHash: 'r1', pipelineHash: 'p1' };

describe('hashKey / stableStringify (DM-406)', () => {
  it('(a) ổn định: cùng input -> cùng key (không phụ thuộc thứ tự object key)', () => {
    const a = hashKey(baseInput);
    const shuffled = { routesHash: 'r1', md: 'content', pipelineHash: 'p1', file: '/x.md', base: '/' } as KeyInput;
    expect(hashKey(shuffled)).toBe(a);
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('(b) đổi 1 byte nội dung md -> key khác', () => {
    expect(hashKey(baseInput)).not.toBe(hashKey({ ...baseInput, md: 'contenT' }));
  });

  it('(c) đổi locales (qua routesHash) -> key khác; đổi themeConfig.title KHÔNG nằm trong KeyInput -> key giống', () => {
    expect(hashKey(baseInput)).not.toBe(hashKey({ ...baseInput, routesHash: 'r2' }));
    // KeyInput không có field nào tên "themeConfig"/"title" -> không cách nào truyền option không liên quan vào hash.
    expect(Object.keys(baseInput).some((k) => /theme/i.test(k))).toBe(false);
  });

  it('(d) đổi remark plugin / option code-fence -> pipelineHash khác -> key khác', () => {
    const p1 = computePipelineHash({ code: { shiki: false }, plugins: [] });
    const p2 = computePipelineHash({ code: { shiki: { themes: { light: 'a', dark: 'b' } } }, plugins: [] });
    const p3 = computePipelineHash({ code: { shiki: false }, plugins: [function extra() {}] });
    expect(p1).not.toBe(p2);
    expect(p1).not.toBe(p3);
    expect(hashKey({ ...baseInput, pipelineHash: p1 })).not.toBe(hashKey({ ...baseInput, pipelineHash: p2 }));
  });

  it('(e) CACHE_VERSION bump -> key khác', () => {
    expect(hashKey(baseInput)).not.toBe(hashKey({ ...baseInput, version: CACHE_VERSION + 1 }));
  });
});

describe('TransformCache (DM-406)', () => {
  const dirs: string[] = [];
  const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dommief-cache-')); dirs.push(d); return d; };
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

  it('(f) write rồi read -> deep-equal; file JSON hợp lệ; không còn .tmp sau khi write', () => {
    const cache = new TransformCache(tmpDir());
    const key = hashKey(baseInput);
    cache.write(key, { code: 'export default 1', meta: { frontmatter: {}, toc: [], texts: [] }, warnings: [] });
    const read = cache.read(key);
    expect(read).toEqual({ code: 'export default 1', meta: { frontmatter: {}, toc: [], texts: [] }, warnings: [] });
    const shard = path.join(cache.dir, key.slice(0, 2));
    expect(fs.readdirSync(shard).every((f) => !f.endsWith('.tmp'))).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(path.join(shard, `${key}.json`), 'utf8'))).not.toThrow();
  });

  it('(g) gc xoá file lạ, giữ file trong keepKeys', () => {
    const cache = new TransformCache(tmpDir());
    const keep = hashKey(baseInput);
    const stale = hashKey({ ...baseInput, md: 'stale' });
    cache.write(keep, { code: '1', meta: { frontmatter: {}, toc: [], texts: [] }, warnings: [] });
    cache.write(stale, { code: '2', meta: { frontmatter: {}, toc: [], texts: [] }, warnings: [] });
    cache.gc(new Set([keep]));
    expect(cache.read(keep)).not.toBeNull();
    expect(cache.read(stale)).toBeNull();
  });

  it('getOrCompute: hit không gọi lại compute(); miss thì gọi và ghi', async () => {
    const cache = new TransformCache(tmpDir());
    let calls = 0;
    const compute = async () => { calls++; return { code: 'c', meta: { frontmatter: {}, toc: [], texts: [] }, warnings: [] }; };
    await cache.getOrCompute('/a.md', baseInput, compute);
    expect(calls).toBe(1);
    expect(cache.stats).toMatchObject({ hit: 0, miss: 1 });

    const cache2 = new TransformCache(cache.dir);
    let calls2 = 0;
    await cache2.getOrCompute('/a.md', baseInput, async () => { calls2++; return { code: 'c', meta: { frontmatter: {}, toc: [], texts: [] }, warnings: [] }; });
    expect(calls2).toBe(0);
    expect(cache2.stats).toMatchObject({ hit: 1, miss: 0 });
  });

  it('enabled=false (--no-cache): luôn miss, không ghi file nào', async () => {
    const dir = tmpDir();
    const cache = new TransformCache(dir, false);
    await cache.getOrCompute('/a.md', baseInput, async () => ({ code: 'c', meta: { frontmatter: {}, toc: [], texts: [] }, warnings: [] }));
    expect(fs.existsSync(dir) && fs.readdirSync(dir).length > 0).toBe(false);
  });

  it('cacheable=false (vd <API src>): luôn compute lại, không ghi cache', async () => {
    const cache = new TransformCache(tmpDir());
    let calls = 0;
    const compute = async () => { calls++; return { code: `c${calls}`, meta: { frontmatter: {}, toc: [], texts: [] }, warnings: [] }; };
    const r1 = await cache.getOrCompute('/api.md', baseInput, compute, false);
    const r2 = await cache.getOrCompute('/api.md', baseInput, compute, false);
    expect(calls).toBe(2); // cacheable=false -> KHÔNG đọc/ghi cache, mỗi lần gọi đều compute lại
    expect(r1).not.toEqual(r2); // compute trả code khác mỗi lần (c1, c2) để phân biệt được với hit
    expect(fs.readdirSync(cache.dir, { recursive: true } as any).length).toBe(0); // không ghi file cache nào
  });
});
