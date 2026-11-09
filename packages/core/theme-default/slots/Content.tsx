import React from 'react';
import styles from '../styles/layout.module.css';

// THEME-API §6: `<main id="main" tabindex="-1">` là đích của skip-link trong DocLayout.
export function Content({ children }: { children?: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className={styles.content!}>
      {children}
    </main>
  );
}
export default Content;
