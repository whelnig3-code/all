"use client";
import { T } from '@/lib/ui-tokens';

interface KpiCardProps {
  label: string;
  value: string | number;
  accent?: string;
  sub?: string;  // 선택적 부제목 (예: "last 1h")
}

export function KpiCard({ label, value, accent, sub }: KpiCardProps) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: '10px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      flex: 1,
      minWidth: 80,
    }}>
      {/* 레이블 */}
      <div className="kpi-label" style={{
        fontSize: 10, color: T.text3, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {label}
      </div>
      {/* 숫자 값 */}
      <div className="kpi-value" style={{
        fontSize: 20, fontWeight: 700,
        color: accent ?? T.text1,
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {/* 선택적 부제목 */}
      {sub && (
        <div style={{ fontSize: 10, color: T.text3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
