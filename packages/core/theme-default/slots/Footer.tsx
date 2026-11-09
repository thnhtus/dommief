import React from 'react';
import styles from '../styles/layout.module.css';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer!}>
      <span>Powered by Dommief © {year}</span>
    </footer>
  );
}
export default Footer;
