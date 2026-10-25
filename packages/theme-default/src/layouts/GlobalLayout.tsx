import React from 'react';
// Biến CSS công khai (THEME-API §9.1) + dark mode: nạp 1 lần ở layout gốc.
import '../styles/variables.css';
// THEME-API §3: luôn import slot qua specifier alias (`dommief/theme/slots/<Name>`), KHÔNG
// bao giờ đường dẫn tương đối — chỉ bare specifier mới đi qua `resolve.alias` của Vite,
// nên đây là điều kiện để `.dommief/theme/slots/Footer` của user thắng được default.
import { Navbar } from 'dommief/theme/slots/Navbar';
import { Footer } from 'dommief/theme/slots/Footer';

// THEME-API §6 (bắt buộc): skip-link phải là phần tử đầu tiên trong `<body>`; đích là
// `#main` do `Content` (slots/Content.tsx) render.
export function GlobalLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <a className="dm-skip" href="#main">Bỏ qua điều hướng</a>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
