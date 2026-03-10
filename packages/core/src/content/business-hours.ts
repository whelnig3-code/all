// =============================================
// 영업시간 확인 서비스
//
// 비유: 가게 문 앞의 영업시간 안내판 — 손님이 왔을 때
//       열려있는지 확인하고, 닫혀있으면 다음 영업 시간을 안내한다.
// =============================================

// =============================================
// 타입 & 기본값
// =============================================

export interface BusinessHoursConfig {
  /** 영업 시작 시간 (0-23, 기본 9) */
  startHour: number
  /** 영업 종료 시간 (0-23, 기본 18) */
  endHour: number
  /** 영업일 (0=일요일, 1=월요일..., 기본 월~금) */
  workDays: number[]
  /** 타임존 (기본: 'Asia/Seoul') */
  timezone: string
}

export interface BusinessHoursResult {
  /** 현재 영업시간 내인지 */
  isOpen: boolean
  /** 영업시간 외 안내 메시지 (isOpen=false일 때) */
  message?: string
  /** 다음 영업 시작 시간 (ISO string) */
  nextOpenAt?: string
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  startHour: 9,
  endHour: 18,
  workDays: [1, 2, 3, 4, 5], // Mon-Fri
  timezone: 'Asia/Seoul',
}

// =============================================
// 내부 헬퍼
// =============================================

const DAY_NAMES_KO: Record<number, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
}

/** UTC Date를 특정 타임존의 시/분/요일로 변환 */
function toTimezoneComponents(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  })

  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''

  const hour = parseInt(get('hour'), 10)
  const minute = parseInt(get('minute'), 10)
  const year = parseInt(get('year'), 10)
  const month = parseInt(get('month'), 10)
  const day = parseInt(get('day'), 10)

  // Intl weekday → JS day number (0=Sun)
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const weekday = weekdayMap[get('weekday')] ?? 0

  return { year, month, day, hour, minute, weekday }
}

/** 영업일 표시 문자열 생성 (예: "월~금") */
function formatWorkDays(workDays: readonly number[]): string {
  const sorted = [...workDays].sort((a, b) => a - b)
  if (sorted.length === 0) return ''

  // 연속 범위 감지
  const isConsecutive = sorted.every(
    (d, i) => i === 0 || d === sorted[i - 1] + 1,
  )

  if (isConsecutive && sorted.length > 1) {
    return `${DAY_NAMES_KO[sorted[0]]}~${DAY_NAMES_KO[sorted[sorted.length - 1]]}`
  }

  return sorted.map((d) => DAY_NAMES_KO[d]).join(', ')
}

/** 시간을 "HH:MM" 형식으로 포맷 */
function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`
}

/** 다음 영업 시작 시간을 계산하여 ISO string으로 반환 */
function calculateNextOpenAt(
  now: Date,
  config: BusinessHoursConfig,
): string {
  const { year, month, day, hour, weekday } = toTimezoneComponents(
    now,
    config.timezone,
  )

  // 오늘이 영업일이고, 아직 영업 시작 전이면 → 오늘 startHour
  const isTodayWorkDay = config.workDays.includes(weekday)
  if (isTodayWorkDay && hour < config.startHour) {
    return toIsoInTimezone(year, month, day, config.startHour, config.timezone)
  }

  // 그 외 → 다음 영업일의 startHour 찾기
  for (let offset = 1; offset <= 7; offset++) {
    const futureDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
    const future = toTimezoneComponents(futureDate, config.timezone)

    if (config.workDays.includes(future.weekday)) {
      return toIsoInTimezone(
        future.year,
        future.month,
        future.day,
        config.startHour,
        config.timezone,
      )
    }
  }

  // fallback (모든 요일이 비영업일인 경우 — 정상적으로는 도달 불가)
  return now.toISOString()
}

/** 타임존 기준 날짜/시간을 UTC ISO string으로 변환 */
function toIsoInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  timezone: string,
): string {
  // 타임존 날짜를 임시 UTC Date로 만들고, 오프셋 보정
  const tempUtc = new Date(Date.UTC(year, month - 1, day, hour, 0, 0))

  // 타임존 오프셋 계산: tempUtc를 timezone으로 해석했을 때의 시간 차이
  const tzComponents = toTimezoneComponents(tempUtc, timezone)
  const offsetHours = tzComponents.hour - hour
  const offsetMinutes = tzComponents.minute

  // 보정: UTC = local - offset
  const corrected = new Date(
    tempUtc.getTime() - (offsetHours * 60 + offsetMinutes) * 60 * 1000,
  )

  return corrected.toISOString()
}

// =============================================
// 메인 함수
// =============================================

/**
 * 현재 시간이 영업시간 내인지 확인
 *
 * @param config - 영업시간 설정 (부분 오버라이드 가능)
 * @param now - 현재 시간 (테스트용 DI, 기본값: new Date())
 * @returns 영업시간 확인 결과
 */
export function checkBusinessHours(
  config?: Partial<BusinessHoursConfig>,
  now?: Date,
): BusinessHoursResult {
  const mergedConfig: BusinessHoursConfig = {
    ...DEFAULT_BUSINESS_HOURS,
    ...config,
  }
  const currentTime = now ?? new Date()

  const { hour, weekday } = toTimezoneComponents(
    currentTime,
    mergedConfig.timezone,
  )

  const isWorkDay = mergedConfig.workDays.includes(weekday)
  const isWithinHours =
    hour >= mergedConfig.startHour && hour < mergedConfig.endHour
  const isOpen = isWorkDay && isWithinHours

  if (isOpen) {
    return { isOpen: true }
  }

  const workDaysStr = formatWorkDays(mergedConfig.workDays)
  const startStr = formatHour(mergedConfig.startHour)
  const endStr = formatHour(mergedConfig.endHour)
  const nextOpenAt = calculateNextOpenAt(currentTime, mergedConfig)

  return {
    isOpen: false,
    message: `현재 영업시간이 아닙니다. 영업시간: ${workDaysStr} ${startStr}~${endStr}. 영업시간 내에 답변드리겠습니다.`,
    nextOpenAt,
  }
}
