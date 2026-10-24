import { toEstree } from 'hast-util-to-estree';
import { toJs, jsx } from 'estree-util-to-js';

/** Specifier mà plugin `dommief:markdown` resolve về `client/index.tsx` của package. */
export const CLIENT_MODULE = 'dommief/client';

export function toModule(hast: any, meta: any): string {
  const estree = toEstree(hast, { elementAttributeNameCase: 'react' }) as any;
  const { value: code } = toJs(estree, { handlers: jsx });
  const body = code.replace(/;\s*$/, '').trim();
  const used = ['DumiDemo', 'DumiApi'].filter((n) => new RegExp(`<${n}[\\s/>]`).test(body));
  const clientImport = used.length ? `import { ${used.join(', ')} } from '${CLIENT_MODULE}';\n` : '';
  return `import React from 'react';
${clientImport}export default function Content(){ return (
${body}
); }
export const meta = ${JSON.stringify(meta)};
`;
}
