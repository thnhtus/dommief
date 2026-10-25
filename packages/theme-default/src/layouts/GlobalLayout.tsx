import React from 'react';
// THEME-API §3: luôn import slot qua specifier alias (`dommief/theme/slots/<Name>`), KHÔNG
// bao giờ đường dẫn tương đối — chỉ bare specifier mới đi qua `resolve.alias` của Vite,
// nên đây là điều kiện để `.dommief/theme/slots/Footer` của user thắng được default.
import { Navbar } from 'dommief/theme/slots/Navbar';
import { Footer } from 'dommief/theme/slots/Footer';

export function GlobalLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
