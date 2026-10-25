import React from 'react';
// THEME-API §3: alias specifier, không đường dẫn tương đối (xem GlobalLayout.tsx).
import { Sidebar } from 'dommief/theme/slots/Sidebar';
import { Toc } from 'dommief/theme/slots/Toc';
import { Content } from 'dommief/theme/slots/Content';

export function DocLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <Sidebar />
      <Content>{children}</Content>
      <Toc />
    </div>
  );
}
