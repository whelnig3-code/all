// =============================================
// config 포트 설정 테스트
// PORT 환경변수 → config.system.port 매핑 검증
// =============================================

describe('config.system.port', () => {
  const originalPort = process.env['PORT']

  afterEach(() => {
    if (originalPort === undefined) {
      delete process.env['PORT']
    } else {
      process.env['PORT'] = originalPort
    }
    jest.resetModules()
  })

  it('PORT=3100 → config.system.port === 3100', () => {
    process.env['PORT'] = '3100'
    const { config } = require('./config')
    expect(config.system.port).toBe(3100)
  })

  it('PORT 미설정 → 기본값 3100', () => {
    delete process.env['PORT']
    const { config } = require('./config')
    expect(config.system.port).toBe(3100)
  })

  it('PORT=3000 이면 안 됨 (jm 에이전트 서버와 충돌)', () => {
    process.env['PORT'] = '3100'
    const { config } = require('./config')
    expect(config.system.port).not.toBe(3000)
  })
})
