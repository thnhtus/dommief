import React from 'react';
import { Sidebar } from '../slots/Sidebar.js';
import { Toc } from '../slots/Toc.js';
import { Content } from '../slots/Content.js';

export function DocLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <Sidebar />
      <Content>{children}</Content>
      <Toc />
    </div>
  );
}
