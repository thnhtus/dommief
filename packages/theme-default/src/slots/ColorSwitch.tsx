import React from 'react';
import { usePrefersColor } from 'dommief/theme-api';
import styles from '../styles/layout.module.css';

// THEME-API §7.6: `color`/`prefers` là `undefined` ở SSR + render đầu — PHẢI render icon
// trung tính lúc đó (không được render "Light"/"Dark" khác nhau tuỳ máy chủ/client, đó là
// hydration mismatch). Nhãn thật chỉ xuất hiện sau khi client đã đọc được localStorage/OS.
export function ColorSwitch() {
  const [color, , setPrefers] = usePrefersColor();
  const label = color === undefined ? 'Đổi giao diện sáng/tối' : color === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  return (
    <button
      type="button"
      className={styles.colorSwitch!}
      aria-label={label}
      onClick={() => setPrefers(color === 'dark' ? 'light' : 'dark')}
    >
      {color === undefined ? '◐' : color === 'dark' ? '☀' : '☾'}
    </button>
  );
}
