/**
 * 날짜 비교 유틸리티 함수 모음
 * 외부 라이브러리 없이 순수 TypeScript로 구현
 */

// ────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────

/** 날짜로 변환 가능한 값 타입 */
export type DateLike = Date | string | number;

/** 날짜 차이 결과 */
export interface DateDiff {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

// ────────────────────────────────────────────
// 내부 헬퍼
// ────────────────────────────────────────────

/**
 * DateLike 값을 Date 객체로 변환합니다.
 * 변환 불가능한 값이면 에러를 던집니다.
 */
function toDate(value: DateLike): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) {
    throw new RangeError(`유효하지 않은 날짜 값: ${String(value)}`);
  }
  return d;
}

// ────────────────────────────────────────────
// 비교 함수
// ────────────────────────────────────────────

/**
 * 두 날짜가 같은지 비교합니다 (밀리초 단위).
 *
 * @param a - 첫 번째 날짜
 * @param b - 두 번째 날짜
 * @returns 두 날짜가 동일하면 true
 *
 * @example
 * isSameDate(new Date("2024-01-01"), "2024-01-01") // true
 */
export function isSameDate(a: DateLike, b: DateLike): boolean {
  return toDate(a).getTime() === toDate(b).getTime();
}

/**
 * 두 날짜가 같은 날(년·월·일)인지 비교합니다.
 *
 * @example
 * isSameDay("2024-01-01T10:00", "2024-01-01T23:59") // true
 */
export function isSameDay(a: DateLike, b: DateLike): boolean {
  const da = toDate(a);
  const db = toDate(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * 두 날짜가 같은 달(년·월)인지 비교합니다.
 */
export function isSameMonth(a: DateLike, b: DateLike): boolean {
  const da = toDate(a);
  const db = toDate(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
}

/**
 * 두 날짜가 같은 해(년도)인지 비교합니다.
 */
export function isSameYear(a: DateLike, b: DateLike): boolean {
  return toDate(a).getFullYear() === toDate(b).getFullYear();
}

/**
 * a가 b보다 이전(과거)인지 확인합니다.
 *
 * @example
 * isBefore("2024-01-01", "2024-06-01") // true
 */
export function isBefore(a: DateLike, b: DateLike): boolean {
  return toDate(a).getTime() < toDate(b).getTime();
}

/**
 * a가 b보다 이후(미래)인지 확인합니다.
 *
 * @example
 * isAfter("2024-06-01", "2024-01-01") // true
 */
export function isAfter(a: DateLike, b: DateLike): boolean {
  return toDate(a).getTime() > toDate(b).getTime();
}

/**
 * 주어진 날짜가 두 날짜 사이에 있는지 확인합니다 (경계 포함).
 *
 * @param target - 확인할 날짜
 * @param start  - 범위 시작
 * @param end    - 범위 끝
 *
 * @example
 * isWithinRange("2024-03-15", "2024-01-01", "2024-12-31") // true
 */
export function isWithinRange(target: DateLike, start: DateLike, end: DateLike): boolean {
  const t = toDate(target).getTime();
  return t >= toDate(start).getTime() && t <= toDate(end).getTime();
}

// ────────────────────────────────────────────
// 차이 계산
// ────────────────────────────────────────────

/**
 * 두 날짜 사이의 일수 차이를 반환합니다 (절댓값).
 *
 * @example
 * diffInDays("2024-01-01", "2024-01-10") // 9
 */
export function diffInDays(a: DateLike, b: DateLike): number {
  const ms = Math.abs(toDate(a).getTime() - toDate(b).getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * 두 날짜 사이의 시간 차이를 반환합니다 (절댓값).
 *
 * @example
 * diffInHours("2024-01-01T00:00", "2024-01-01T06:30") // 6
 */
export function diffInHours(a: DateLike, b: DateLike): number {
  const ms = Math.abs(toDate(a).getTime() - toDate(b).getTime());
  return Math.floor(ms / (1000 * 60 * 60));
}

/**
 * 두 날짜 사이의 분 차이를 반환합니다 (절댓값).
 */
export function diffInMinutes(a: DateLike, b: DateLike): number {
  const ms = Math.abs(toDate(a).getTime() - toDate(b).getTime());
  return Math.floor(ms / (1000 * 60));
}

/**
 * 두 날짜 사이의 상세 차이를 반환합니다.
 * a → b 방향(a가 b보다 이전이면 양수).
 */
export function dateDiff(a: DateLike, b: DateLike): DateDiff {
  const da = toDate(a);
  const db = toDate(b);
  const totalMs = db.getTime() - da.getTime();
  const absTotalMs = Math.abs(totalMs);

  // 절댓값 기준으로 분해
  const seconds = Math.floor(absTotalMs / 1000) % 60;
  const minutes = Math.floor(absTotalMs / (1000 * 60)) % 60;
  const hours = Math.floor(absTotalMs / (1000 * 60 * 60)) % 24;
  const days = Math.floor(absTotalMs / (1000 * 60 * 60 * 24)) % 30;
  const months = Math.floor(absTotalMs / (1000 * 60 * 60 * 24 * 30)) % 12;
  const years = Math.floor(absTotalMs / (1000 * 60 * 60 * 24 * 365));

  return { years, months, days, hours, minutes, seconds, totalMs };
}

// ────────────────────────────────────────────
// 상태 확인
// ────────────────────────────────────────────

/**
 * 주어진 날짜가 오늘인지 확인합니다.
 */
export function isToday(date: DateLike): boolean {
  return isSameDay(date, new Date());
}

/**
 * 주어진 날짜가 어제인지 확인합니다.
 */
export function isYesterday(date: DateLike): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

/**
 * 주어진 날짜가 내일인지 확인합니다.
 */
export function isTomorrow(date: DateLike): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameDay(date, tomorrow);
}

/**
 * 주어진 날짜가 과거인지 확인합니다.
 */
export function isPast(date: DateLike): boolean {
  return toDate(date).getTime() < Date.now();
}

/**
 * 주어진 날짜가 미래인지 확인합니다.
 */
export function isFuture(date: DateLike): boolean {
  return toDate(date).getTime() > Date.now();
}

// ────────────────────────────────────────────
// 사람이 읽기 쉬운 상대 시간
// ────────────────────────────────────────────

/**
 * 주어진 날짜를 현재 기준으로 "3일 전", "방금 전" 등 상대 시간 문자열로 반환합니다.
 *
 * @param date - 기준 날짜
 * @param now  - 비교 기준 (기본값: 현재 시각)
 *
 * @example
 * timeAgo("2024-01-01T10:00", new Date("2024-01-01T10:00:30")) // "방금 전"
 * timeAgo("2024-01-01", new Date("2024-01-05"))                // "4일 전"
 */
export function timeAgo(date: DateLike, now: DateLike = new Date()): string {
  const diffMs = toDate(now).getTime() - toDate(date).getTime();
  const absDiff = Math.abs(diffMs);
  const future = diffMs < 0;

  // 단위별 임계값 (밀리초)
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  let label: string;

  if (absDiff < 10 * 1000) {
    label = "방금 전";
  } else if (absDiff < MINUTE) {
    label = `${Math.floor(absDiff / 1000)}초 ${future ? "후" : "전"}`;
  } else if (absDiff < HOUR) {
    label = `${Math.floor(absDiff / MINUTE)}분 ${future ? "후" : "전"}`;
  } else if (absDiff < DAY) {
    label = `${Math.floor(absDiff / HOUR)}시간 ${future ? "후" : "전"}`;
  } else if (absDiff < WEEK) {
    label = `${Math.floor(absDiff / DAY)}일 ${future ? "후" : "전"}`;
  } else if (absDiff < MONTH) {
    label = `${Math.floor(absDiff / WEEK)}주 ${future ? "후" : "전"}`;
  } else if (absDiff < YEAR) {
    label = `${Math.floor(absDiff / MONTH)}달 ${future ? "후" : "전"}`;
  } else {
    label = `${Math.floor(absDiff / YEAR)}년 ${future ? "후" : "전"}`;
  }

  return label;
}
