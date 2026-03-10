// =============================================
// 영업시간 확인 서비스 테스트
//
// 비유: 가게 문 앞의 영업시간 안내판 —
//       손님이 왔을 때 열려있는지, 닫혀있으면 언제 여는지 알려준다.
// =============================================

import {
  checkBusinessHours,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHoursConfig,
  type BusinessHoursResult,
} from './business-hours'

/** KST 기준 Date 생성 헬퍼 (UTC offset -9h → new Date 내부는 UTC) */
function kstDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  // KST = UTC+9, so UTC = KST - 9
  const utcHour = hour - 9
  return new Date(Date.UTC(year, month - 1, day, utcHour, minute))
}

describe('checkBusinessHours', () => {
  // =============================================
  // 기본 영업시간 (월~금 09:00~18:00 KST)
  // =============================================

  it('평일 영업시간 내 → isOpen: true', () => {
    // 2026-03-09 (월) 10:00 KST
    const monday10am = kstDate(2026, 3, 9, 10)
    const result = checkBusinessHours(undefined, monday10am)

    expect(result.isOpen).toBe(true)
    expect(result.message).toBeUndefined()
  })

  it('평일 영업시간 전 → isOpen: false', () => {
    // 2026-03-09 (월) 08:00 KST
    const monday8am = kstDate(2026, 3, 9, 8)
    const result = checkBusinessHours(undefined, monday8am)

    expect(result.isOpen).toBe(false)
    expect(result.message).toBeDefined()
  })

  it('평일 영업시간 후 → isOpen: false', () => {
    // 2026-03-09 (월) 19:00 KST
    const monday7pm = kstDate(2026, 3, 9, 19)
    const result = checkBusinessHours(undefined, monday7pm)

    expect(result.isOpen).toBe(false)
    expect(result.message).toBeDefined()
  })

  it('주말 → isOpen: false', () => {
    // 2026-03-08 (일) 12:00 KST
    const sunday12pm = kstDate(2026, 3, 8, 12)
    const result = checkBusinessHours(undefined, sunday12pm)

    expect(result.isOpen).toBe(false)
    expect(result.message).toBeDefined()
  })

  // =============================================
  // 커스텀 설정
  // =============================================

  it('커스텀 영업시간 설정이 적용된다', () => {
    const customConfig: Partial<BusinessHoursConfig> = {
      startHour: 10,
      endHour: 22,
      workDays: [0, 1, 2, 3, 4, 5, 6], // 매일
    }

    // 토요일 21:00 KST → 커스텀 설정에서는 영업중
    const saturday9pm = kstDate(2026, 3, 7, 21)
    const result = checkBusinessHours(customConfig, saturday9pm)

    expect(result.isOpen).toBe(true)
  })

  // =============================================
  // 메시지 내용 검증
  // =============================================

  it('영업시간 외일 때 메시지에 영업시간 정보가 포함된다', () => {
    // 2026-03-08 (일) 12:00 KST
    const sunday12pm = kstDate(2026, 3, 8, 12)
    const result = checkBusinessHours(undefined, sunday12pm)

    expect(result.message).toContain('영업시간')
    expect(result.message).toContain('09:00')
    expect(result.message).toContain('18:00')
  })

  // =============================================
  // nextOpenAt 계산
  // =============================================

  it('영업시간 외일 때 nextOpenAt이 정확히 계산된다 (평일 영업 전)', () => {
    // 2026-03-09 (월) 07:00 KST → 같은 날 09:00 KST에 오픈
    const monday7am = kstDate(2026, 3, 9, 7)
    const result = checkBusinessHours(undefined, monday7am)

    expect(result.nextOpenAt).toBeDefined()
    const nextOpen = new Date(result.nextOpenAt!)
    // 다음 오픈: 2026-03-09 09:00 KST = 2026-03-09 00:00 UTC
    expect(nextOpen.toISOString()).toBe('2026-03-09T00:00:00.000Z')
  })

  it('금요일 영업시간 후 → nextOpenAt이 다음 월요일이다', () => {
    // 2026-03-13 (금) 19:00 KST → 다음 월요일 03-16 09:00 KST
    const friday7pm = kstDate(2026, 3, 13, 19)
    const result = checkBusinessHours(undefined, friday7pm)

    expect(result.nextOpenAt).toBeDefined()
    const nextOpen = new Date(result.nextOpenAt!)
    // 2026-03-16 09:00 KST = 2026-03-16 00:00 UTC
    expect(nextOpen.toISOString()).toBe('2026-03-16T00:00:00.000Z')
  })

  // =============================================
  // 기본 설정 검증
  // =============================================

  it('기본 설정은 월~금 09:00~18:00 KST이다', () => {
    expect(DEFAULT_BUSINESS_HOURS.startHour).toBe(9)
    expect(DEFAULT_BUSINESS_HOURS.endHour).toBe(18)
    expect(DEFAULT_BUSINESS_HOURS.workDays).toEqual([1, 2, 3, 4, 5])
    expect(DEFAULT_BUSINESS_HOURS.timezone).toBe('Asia/Seoul')
  })

  // =============================================
  // 경계값 테스트
  // =============================================

  it('정확히 영업 시작 시간 → isOpen: true', () => {
    // 2026-03-09 (월) 09:00 KST
    const monday9am = kstDate(2026, 3, 9, 9)
    const result = checkBusinessHours(undefined, monday9am)

    expect(result.isOpen).toBe(true)
  })

  it('정확히 영업 종료 시간 → isOpen: false', () => {
    // 2026-03-09 (월) 18:00 KST — endHour는 exclusive
    const monday6pm = kstDate(2026, 3, 9, 18)
    const result = checkBusinessHours(undefined, monday6pm)

    expect(result.isOpen).toBe(false)
  })
})
