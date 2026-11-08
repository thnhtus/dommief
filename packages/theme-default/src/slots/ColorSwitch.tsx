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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {color === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        )}
      </svg>
    </button>
  );
}
export default ColorSwitch;
