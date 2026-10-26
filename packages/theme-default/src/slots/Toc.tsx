import React from 'react';
import { useRouteMeta } from 'dommief/theme-api';
import styles from '../styles/layout.module.css';

// THEME-API §6: `<nav aria-label>` riêng cho mục lục (khác nhãn Navbar/Sidebar).
export default function Toc() {
  const meta = useRouteMeta() as any;
  const toc = (meta?.toc ?? []) as { id: string; depth: number; title: string }[];
  return (
    <nav aria-label="On this page" className={styles.toc!}>
      {toc.map((t) => (
        <a key={t.id} href={`#${t.id}`}>{t.title}</a>
      ))}
    </nav>
  );
}
