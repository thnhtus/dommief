import React from 'react';
import { useRouteMeta } from 'dommief/theme-api';
import styles from '../styles/layout.module.css';

// THEME-API §6: `<nav aria-label>` riêng cho mục lục (khác nhãn Navbar/Sidebar).
export function Toc() {
  const meta = useRouteMeta() as any;
  const toc = (meta?.toc ?? []) as { id: string; depth: number; title: string }[];
  if (!toc.length) return null;
  return (
    <nav aria-label="On this page" className={styles.toc!}>
      <span className={styles.toc__label!}>On this page</span>
      {toc.map((t) => (
        <a key={t.id} href={`#${t.id}`} style={t.depth > 2 ? { paddingInlineStart: 'var(--dm-space-4)' } : undefined}>
          {t.title}
        </a>
      ))}
    </nav>
  );
}
export default Toc;
