// =============================================
// Kill Switch 가드 단위 테스트
// AUTO_PRICE_ENABLED / AUTO_ORDER_ENABLED / AUTO_SHIPPING_ENABLED
// =============================================

/** 각 job 핸들러에서 사용하는 가드 조건식과 동일한 함수 */
function isDisabled(envValue: string | undefined): boolean {
  return envValue !== 'true'
}

describe('Kill Switch 가드 조건', () => {
  const SWITCHES = [
    { name: 'AUTO_PRICE_ENABLED',    warnKey: 'AUTO_PRICE_DISABLED' },
    { name: 'AUTO_ORDER_ENABLED',    warnKey: 'AUTO_ORDER_DISABLED' },
    { name: 'AUTO_SHIPPING_ENABLED', warnKey: 'AUTO_SHIPPING_DISABLED' },
  ]

  SWITCHES.forEach(({ name }) => {
    describe(name, () => {
      afterEach(() => {
        delete process.env[name]
      })

      it('"true" → 가드 비활성 (실행 허용)', () => {
        process.env[name] = 'true'
        expect(isDisabled(process.env[name])).toBe(false)
      })

      it('"false" → 가드 활성 (실행 차단)', () => {
        process.env[name] = 'false'
        expect(isDisabled(process.env[name])).toBe(true)
      })

      it('미설정(undefined) → 가드 활성 (기본 차단)', () => {
        delete process.env[name]
        expect(isDisabled(process.env[name])).toBe(true)
      })

      it('"TRUE" (대문자) → 가드 활성 (정확히 소문자 "true"만 허용)', () => {
        process.env[name] = 'TRUE'
        expect(isDisabled(process.env[name])).toBe(true)
      })
    })
  })
})
