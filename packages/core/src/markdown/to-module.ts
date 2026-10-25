import { toEstree } from 'hast-util-to-estree';
import { toJs, jsx } from 'estree-util-to-js';

/** Specifier mà plugin `dommief:markdown` resolve về `client/index.tsx` của package. */
export const CLIENT_MODULE = 'dommief/client';

export interface ModuleImage { name: string; specifier: string }

export function toModule(hast: any, meta: { frontmatter: unknown; toc: unknown; texts?: unknown }, images: ModuleImage[] = [], demos: { id: string; source: string; src?: string }[] = []): string {
  // `texts` chỉ dùng để build search index lúc build (buildSearchIndex nhận trực tiếp PageMeta từ
  // transformMarkdown, không đọc export này) — bỏ khỏi bundle gửi cho trình duyệt (#20).
  const { texts: _texts, ...clientMeta } = meta;
  const estree = toEstree(hast, { elementAttributeNameCase: 'react' }) as any;
  const { value: code } = toJs(estree, { handlers: jsx });
  let body = code.replace(/;\s*$/, '').trim();
  const imageImports = images.map((im, i) => {
    body = body.split(`src="${im.name}"`).join(`src={__dmImg${i}}`);
    return `import __dmImg${i} from ${JSON.stringify(im.specifier)};\n`;
  }).join('');
  const used = ['DumiDemo', 'DumiApi'].filter((n) => new RegExp(`<${n}[\\s/>]`).test(body));
  const clientNames = [...used];
  if (demos.length) clientNames.push('registerDemo');
  const clientImport = clientNames.length ? `import { ${Array.from(new Set(clientNames)).join(', ')} } from '${CLIENT_MODULE}';\n` : '';
  const demoImports = demos.map((d) => {
    const specifier = d.src ? d.src : `virtual:dommief-demo/${d.id}`;
    return `import Demo_${d.id} from ${JSON.stringify(specifier)};\n`;
  }).join('');
  const demoRegs = demos.map((d) => `registerDemo(${JSON.stringify(d.id)}, Demo_${d.id});\n`).join('');
  return `import React from 'react';
${imageImports}${clientImport}${demoImports}${demoRegs}export default function Content(){ return (
${body}
); }
export const meta = ${JSON.stringify(clientMeta)};
`;
}
