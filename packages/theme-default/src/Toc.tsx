import React from 'react';
import { useRouteMeta } from 'dommief/theme-api';

export function Toc() {
  const meta = useRouteMeta() as any;
  const toc = (meta?.toc ?? []) as { id: string; depth: number; title: string }[];
  return (
    <nav>
      {toc.map((t) => (
        <a key={t.id} href={`#${t.id}`}>{t.title}</a>
      ))}
    </nav>
  );
}
