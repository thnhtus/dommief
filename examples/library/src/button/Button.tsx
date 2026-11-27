import React from 'react';

export interface ButtonProps {
  /** Nhãn hiển thị trên nút */
  label: string;
  /** Kích thước nút */
  size?: 'sm' | 'md' | 'lg';
  /** Sự kiện bấm */
  onClick?: () => void;
}

export function Button({ label, size = 'md', onClick }: ButtonProps) {
  return (
    <button type="button" data-size={size} onClick={onClick}>
      {label}
    </button>
  );
}
