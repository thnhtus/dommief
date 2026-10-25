import { visit } from 'unist-util-visit';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DommiefError } from './errors.js';

// Nạp react-docgen-typescript (kéo theo cả TypeScript) CHỈ khi trang có `<API>`: import ở đầu file
// làm mọi site crash lúc khởi động nếu typescript cài được không có API JS cũ (TS 7).
let docgen: typeof import('react-docgen-typescript') | undefined;
function loadDocgen(): typeof import('react-docgen-typescript') {
  if (docgen) return docgen;
  try {
    docgen = createRequire(import.meta.url)('react-docgen-typescript');
    return docgen!;
  } catch (e) {
    throw new DommiefError(`<API> cần react-docgen-typescript + typescript 5.x: ${(e as Error).message}`, { code: 'api_docgen_unavailable' });
  }
}

export interface ApiProp {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
  defaultValue?: any;
}

export interface ApiEntry {
  displayName: string;
  description?: string;
  props: ApiProp[];
  src: string;
  hash: string;
}

// Cache theo file tuyệt đối (một entry mỗi file, thay bằng bản mới khi hash đổi — map không phình mãi theo #17).
const apiCache = new Map<string, { hash: string; entries: ApiEntry[] }>();

export function clearApiCache(): void {
  apiCache.clear();
}

export function hashFileContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function resolveApiSrc(src: string, filePath: string): string {
  const base = filePath ? path.dirname(filePath) : process.cwd();
  return path.isAbsolute(src) ? src : path.resolve(base, src);
}

export function buildApiTable(src: string, filePath: string = ''): ApiEntry[] | null {
  const abs = resolveApiSrc(src, filePath);
  let content: string;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
  const hash = hashFileContent(content);
  const cached = apiCache.get(abs);
  if (cached && cached.hash === hash) return cached.entries;

  // loadDocgen() ngoài try: thiếu/sai bản typescript phải báo lỗi, không được nuốt thành "No API data".
  const parser = loadDocgen().withDefaultConfig({});
  let docs: any[] = [];
  try {
    docs = parser.parse(abs) ?? [];
  } catch {
    docs = []; // file không parse được (cú pháp lỗi) → bảng rỗng
  }

  const entries: ApiEntry[] = (docs || []).map((d: any) => ({
    displayName: d.displayName,
    description: d.description || '',
    src: abs,
    hash,
    props: Object.values(d.props || {}).map((p: any) => ({
      name: p.name,
      type: p.type?.name ?? p.type?.raw ?? '',
      required: !!p.required,
      description: p.description || '',
      defaultValue: p.defaultValue?.value,
    })),
  }));

  apiCache.set(abs, { hash, entries });
  return entries;
}

export function rehypeApi() {
  return (tree: any, file: any) => {
    // file.data.apiSrcFiles: để caller (vite/plugin.ts) `addWatchFile` từng file — Vite chỉ tự
    // watch file.md, không biết plugin có đọc thêm .tsx (#17).
    const apis: any[] = Array.isArray((file?.data as any)?.apis) ? (file.data as any).apis : [];
    const watched: string[] = Array.isArray((file?.data as any)?.apiSrcFiles) ? (file.data as any).apiSrcFiles : [];
    const filePath = String((file as any)?.path ?? '');

    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== 'number') return;
      if (String(node.tagName).toLowerCase() !== 'api') return;
      const src = String(node.properties?.src ?? '');
      if (!src) return;

      const abs = resolveApiSrc(src, filePath);
      const data = buildApiTable(src, filePath);
      watched.push(abs);

      apis.push({ id: hashFileContent(src + filePath).slice(0, 8), src: abs, data });

      parent.children[index] = {
        type: 'element',
        tagName: 'DumiApi',
        properties: {
          src: abs,
          data: data ? JSON.stringify(data) : undefined,
        },
        children: [],
      };
    });

    if (file?.data) {
      (file.data as any).apis = apis;
      (file.data as any).apiSrcFiles = watched;
    }
  };
}