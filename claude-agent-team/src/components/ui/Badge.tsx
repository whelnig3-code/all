"use client";
import { T } from '@/lib/ui-tokens';

type BadgeStatus = 'active' | 'pending' | 'error' | 'disabled';

const COLORS: Record<BadgeStatus, { bg: string; color: string }> = {
  active:   { bg: T.active + '22',  color: T.active },
  pending:  { bg: T.pending + '22', color: T.pending },
  error:    { bg: T.error + '22',   color: T.error },
  disabled: { bg: T.text3 + '22',   color: T.text3 },
};

const DEFAULTS: Record<BadgeStatus, string> = {
  active: 'Active', pending: 'Pending', error: 'Error', disabled: 'Disabled',
};

export function Badge({ status, label }: { status: BadgeStatus; label?: string }) {
  const { bg, color } = COLORS[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, color, border: `1px solid ${color}40`,
      borderRadius: 999, padding: '2px 8px',
      fontSize: 11, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label ?? DEFAULTS[status]}
    </span>
  );
}
