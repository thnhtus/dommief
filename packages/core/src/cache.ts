import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PageMeta } from './markdown/index.js';
import { CODE_PIPELINE_VERSION } from './markdown/rehype-code.js';

// Đặc tả: docs/backlog/DM-406.md (+ Amendment: payload là { code, meta }, không cache HTML).
// Cache transform markdown theo NỘI DUNG (không phải mtime: git checkout đổi mtime dù nội dung y hệt).
// Chỉ dùng cho `dommief build`; dev chạy trong bộ nhớ Vite.

/** Bump khi đổi shape payload hoặc logic transform: mọi entry cũ bị bỏ qua, không phục vụ `code` cũ. */
export const CACHE_VERSION = 3; // v3: rename DumiDemo/DumiApi -> DomDemo/DomApi (aliases giữ lại)

export interface CachePayload {
  code: string;
  meta: PageMeta;
  warnings: string[];
  /** Demo của trang; thiếu = payload cũ, không dùng được (module trang import virtual demo). */
  demos?: { id: string; source: string; src?: string }[];
}

/** Mọi thứ làm đổi output của MỘT trang. Thiếu một mục ở đây = bug "build cũ dính vào build mới". */
export interface KeyInput {
  /** Nội dung file md. */
  md: string;
  /** Đường dẫn file (demo id + data-src-line + link tương đối phụ thuộc vào nó). */
  file: string;
  /** config.base: rehypeLink gắn tiền tố này vào href nội bộ. */
  base: string;
  /** Hash bảng route (byFile→path): đổi tên/thêm/xoá một file khác làm đổi href đã resolve của trang này. */
  routesHash: string;
  /** Option markdown (shiki themes, lineNumbers) + danh sách plugin. */
  pipelineHash: string;
  version?: number;
}

/** JSON ổn định: key object sắp xếp, không phụ thuộc thứ tự chèn (2 process cho cùng key). */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function hashKey(input: KeyInput): string {
  return sha(stableStringify({ ...input, version: input.version ?? CACHE_VERSION }));
}

export function computeRoutesHash(byFile: Record<string, { path: string }>): string {
  return sha(stableStringify(Object.fromEntries(Object.entries(byFile).map(([f, r]) => [f, r.path]))));
}

/** Hash option markdown + plugin. Hàm plugin được băm theo mã nguồn (đổi plugin => miss). */
export function computePipelineHash(opts: { code?: unknown; plugins?: unknown[] }): string {
  const plugins = (opts.plugins ?? []).map((p) => (typeof p === 'function' ? String(p) : stableStringify(p)));
  return sha(stableStringify({ code: opts.code ?? null, plugins, codeVersion: CODE_PIPELINE_VERSION }));
}

export type MissReason = 'new' | 'md-changed' | 'config-changed' | 'pipeline-changed';

export interface CacheStats {
  hit: number;
  miss: number;
  missReasons: Record<string, MissReason>;
}

interface ManifestEntry { md: string; context: string; key: string }
type Manifest = Record<string, ManifestEntry>;

export class TransformCache {
  readonly stats: CacheStats = { hit: 0, miss: 0, missReasons: {} };
  private readonly counted = new Set<string>();
  private readonly used = new Set<string>();
  private manifest: Manifest = {};
  private nextManifest: Manifest = {};

  constructor(readonly dir: string, private readonly enabled = true) {
    if (!enabled) return;
    try { this.manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { this.manifest = {}; }
  }

  private fileOf(key: string): string { return path.join(this.dir, key.slice(0, 2), `${key}.json`); }

  read(key: string): CachePayload | null {
    if (!this.enabled) return null;
    try {
      const v = JSON.parse(fs.readFileSync(this.fileOf(key), 'utf8')) as CachePayload;
      return typeof v?.code === 'string' && v.meta ? v : null;
    } catch { return null; }
  }

  /** Ghi nguyên tử: tmp cùng thư mục rồi rename (build bị kill giữa chừng không để lại JSON cụt; cùng ổ nên rename không fail trên Windows). */
  write(key: string, payload: CachePayload): void {
    if (!this.enabled) return;
    const file = this.fileOf(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, file);
  }

  /** Xoá file cache không còn dùng (trang bị xoá/đổi tên/đổi nội dung). Best-effort, không throw. */
  gc(keepKeys: Set<string>): void {
    if (!this.enabled) return;
    try {
      for (const shard of fs.readdirSync(this.dir, { withFileTypes: true })) {
        if (!shard.isDirectory()) continue;
        for (const f of fs.readdirSync(path.join(this.dir, shard.name))) {
          if (!keepKeys.has(f.replace(/\.json$/, '')) || f.endsWith('.tmp')) fs.rmSync(path.join(this.dir, shard.name, f), { force: true });
        }
      }
    } catch { /* best-effort */ }
  }

  /**
   * Lấy từ cache hoặc tính mới. Mỗi file chỉ tính vào `stats` ở lần tra ĐẦU: build chạy plugin 2 lần
   * (client + SSR), lần 2 luôn hit vì lần 1 vừa ghi — đếm cả hai sẽ làm số liệu vô nghĩa.
   */
  async getOrCompute(file: string, input: KeyInput, compute: () => Promise<CachePayload>, cacheable = true): Promise<CachePayload> {
    const key = hashKey(input);
    const context = sha(stableStringify({ base: input.base, routesHash: input.routesHash }));
    const first = !this.counted.has(file);
    const hit = cacheable ? this.read(key) : null;
    if (hit) {
      if (first) this.stats.hit++;
      this.record(file, key, input, context);
      return hit;
    }
    if (first) {
      this.stats.miss++;
      this.stats.missReasons[file] = this.reasonFor(file, input, context);
    }
    this.counted.add(file);
    const payload = await compute();
    if (cacheable) { this.write(key, payload); this.record(file, key, input, context); }
    return payload;
  }

  private record(file: string, key: string, input: KeyInput, context: string): void {
    this.counted.add(file);
    this.used.add(key);
    this.nextManifest[file] = { md: sha(input.md), context: `${context}|${input.pipelineHash}`, key };
  }

  private reasonFor(file: string, input: KeyInput, context: string): MissReason {
    const prev = this.manifest[file];
    if (!prev) return 'new';
    if (prev.md !== sha(input.md)) return 'md-changed';
    const [prevCtx, prevPipe] = [prev.context.split('|')[0], prev.context.split('|')[1]];
    if (prevPipe !== input.pipelineHash) return 'pipeline-changed';
    return prevCtx !== context ? 'config-changed' : 'md-changed';
  }

  /** Cuối build: ghi manifest + gc theo các key vừa dùng. Chỉ giữ entry của file còn tồn tại. */
  finish(): void {
    if (!this.enabled) return;
    this.gc(this.used);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(path.join(this.dir, 'manifest.json'), JSON.stringify(this.nextManifest));
    } catch { /* best-effort */ }
  }

  summary(): string {
    const total = this.stats.hit + this.stats.miss;
    return `cache ${this.stats.hit}/${total} hit`;
  }
}
