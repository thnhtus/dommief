import React from 'react';

export function Content({ children }: { children?: React.ReactNode }) {
  return <main>{children}</main>;
}
