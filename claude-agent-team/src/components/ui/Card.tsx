"use client";
import { T } from '@/lib/ui-tokens';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  padding?: number | string;
}

export function Card({ children, style, padding = 16 }: CardProps) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding,
      ...style,
    }}>
      {children}
    </div>
  );
}
