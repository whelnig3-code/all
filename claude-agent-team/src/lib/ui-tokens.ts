// 운영 콘솔형 UI 디자인 토큰
// 모든 컴포넌트에서 이 상수를 사용하여 일관된 스타일 유지
// CSS 변수를 참조 → 런타임에 data-theme 속성에 따라 값이 바뀜

export const T = {
  // 배경색
  bg:        'var(--bg)',
  card:      'var(--card)',
  cardHover: 'var(--card-hover)',
  border:    'var(--border)',

  // 텍스트
  text1:     'var(--text1)',
  text2:     'var(--text2)',
  text3:     'var(--text3)',

  // 강조색
  accent:    'var(--accent)',
  active:    'var(--active)',
  pending:   'var(--pending)',
  error:     'var(--error)',
} as const;

export type TokenKey = keyof typeof T;

// 다크 테마 원시 값 (CSS 변수 정의용)
export const DARK_VALUES = {
  bg:        '#111318',
  card:      '#181C23',
  cardHover: '#1F2430',
  border:    '#252B36',
  text1:     '#E6EDF3',
  text2:     '#9CA3AF',
  text3:     '#6B7280',
  accent:    '#4C8DFF',
  active:    '#22C55E',
  pending:   '#F59E0B',
  error:     '#EF4444',
} as const;

// 라이트 테마 원시 값
export const LIGHT_VALUES = {
  bg:        '#F8FAFC',
  card:      '#FFFFFF',
  cardHover: '#F1F5F9',
  border:    '#E2E8F0',
  text1:     '#1E293B',
  text2:     '#64748B',
  text3:     '#94A3B8',
  accent:    '#2563EB',
  active:    '#16A34A',
  pending:   '#D97706',
  error:     '#DC2626',
} as const;
