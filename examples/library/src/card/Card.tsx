import React from 'react';

export interface CardProps {
  /** Tiêu đề thẻ */
  heading: string;
  children?: React.ReactNode;
}

export function Card({ heading, children }: CardProps) {
  return (
    <section style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
      <h3>{heading}</h3>
      <div>{children}</div>
    </section>
  );
}
