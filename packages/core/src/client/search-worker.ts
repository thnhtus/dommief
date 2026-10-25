/// <reference lib="webworker" />
import { SearchCore, type SearchManifest } from './search-core.js';

// Đặc tả: docs/backlog/DM-802.md. CHỈ plumbing postMessage <-> SearchCore — không logic nghiệp vụ
// ở đây (test được bằng cách gọi search-core.ts trực tiếp, KHÔNG cần spawn Worker thật trong
// vitest — xem comment search-core.ts). File này chỉ verify được bằng build thật (không chứa
// 'react'/'react-dom' — tiêu chí DM-802 #2) + kiểm tay trình duyệt thật (DM-803 #5).

export interface SearchWorkerRequest { id: number; type: 'search'; query: string; locale: string }
export interface SearchWorkerInitMessage { type: 'init'; manifest: SearchManifest }
/** Đổi locale (DM-802 tiêu chí #3): huỷ cache index của locale cũ TRONG worker — không chỉ dừng
 * ở API SearchCore.dropLocale mà phải có đường dẫn message thật từ main thread gọi tới, nếu
 * không index cũ nằm lại trong bộ nhớ worker mãi (review #5). */
export interface SearchWorkerDropLocaleMessage { type: 'dropLocale'; locale: string }
export type SearchWorkerInbound = SearchWorkerRequest | SearchWorkerInitMessage | SearchWorkerDropLocaleMessage;

export interface SearchWorkerResponse { id: number; hits: unknown[]; error: string | undefined }

let core: SearchCore | null = null;

// SAFETY: file này chỉ chạy TRONG một dedicated worker thật (entry riêng, không import ở main
// thread) — `self` ở ngữ cảnh đó LÀ `DedicatedWorkerGlobalScope`, có `postMessage(data)`. Cast vì
// tsconfig gộp lib DOM (cho phần còn lại của repo) nên `self` ở đây suy ra kiểu `Window`, vốn đòi
// `postMessage(message, targetOrigin)` — khác chữ ký — không phải vì logic sai.
const post = (data: SearchWorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(data);

self.onmessage = async (ev: MessageEvent<SearchWorkerInbound>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    core = new SearchCore(msg.manifest);
    return;
  }
  if (msg.type === 'dropLocale') {
    core?.dropLocale(msg.locale);
    return;
  }
  if (msg.type === 'search') {
    if (!core) {
      post({ id: msg.id, hits: [], error: 'search worker chưa init' });
      return;
    }
    const result = await core.search(msg.query, msg.locale);
    post({ id: msg.id, hits: result.hits, error: result.error });
  }
};
