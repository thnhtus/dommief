import { toEstree } from 'hast-util-to-estree';
import { toJs, jsx } from 'estree-util-to-js';

export function toModule(hast: any, meta: any): string {
  const estree = toEstree(hast, { elementAttributeNameCase: 'react' }) as any;
  const { value: code } = toJs(estree, { handlers: jsx });
  const body = code.replace(/;\s*$/, '').trim();
  return `import React from 'react';
export default function Content(){ return (
${body}
); }
export const meta = ${JSON.stringify(meta)};
`;
}
