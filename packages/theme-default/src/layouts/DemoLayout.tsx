import React from 'react';
// THEME-API §3: alias specifier, không đường dẫn tương đối (xem GlobalLayout.tsx).
import Content from 'dommief/theme/slots/Content';

export function DemoLayout({ children }: { children?: React.ReactNode }) {
  return <Content>{children}</Content>;
}
export default DemoLayout;
