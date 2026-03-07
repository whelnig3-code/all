// =============================================
// 이미지 리디자인 모듈 테스트
//
// child_process.execFile을 mock하여
// Python 스크립트 호출 없이 로직 검증
// =============================================

import { execFile } from 'child_process'

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}))

jest.mock('@smartstore/shared', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

const mockExecFile = execFile as unknown as jest.Mock

import { redesignImage } from './image-redesign'

describe('redesignImage', () => {
  const defaultParams = {
    inputPath: '/tmp/input.jpg',
    outputPath: '/tmp/output.jpg',
    titleKo: '무선 블루투스 이어폰',
    bulletsKo: ['고음질 사운드', '12시간 배터리', '방수 IPX5'],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Python 스크립트 성공 → outputPath 반환', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null, '', '')
      },
    )

    const result = await redesignImage(defaultParams)

    expect(result).toBe('/tmp/output.jpg')
    expect(mockExecFile).toHaveBeenCalledWith(
      'python',
      expect.arrayContaining([
        '--input', '/tmp/input.jpg',
        '--output', '/tmp/output.jpg',
        '--title', '무선 블루투스 이어폰',
        '--bullets', '고음질 사운드,12시간 배터리,방수 IPX5',
      ]),
      expect.objectContaining({ timeout: 120000 }),
      expect.any(Function),
    )
  })

  it('Python 실행 에러 → null 반환 (degrade)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(new Error('python not found'), '', 'command not found')
      },
    )

    const result = await redesignImage(defaultParams)
    expect(result).toBeNull()
  })

  it('불릿 4개 이상 → 최대 3개만 전달', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null, '', '')
      },
    )

    await redesignImage({
      ...defaultParams,
      bulletsKo: ['첫번째', '두번째', '세번째', '네번째', '다섯번째'],
    })

    const callArgs = mockExecFile.mock.calls[0]![1] as string[]
    const bulletsIdx = callArgs.indexOf('--bullets')
    const bulletsValue = callArgs[bulletsIdx + 1]!

    expect(bulletsValue).toBe('첫번째,두번째,세번째')
    expect(bulletsValue.split(',').length).toBe(3)
  })

  it('빈 불릿 배열 → 빈 문자열 전달', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null, '', '')
      },
    )

    await redesignImage({
      ...defaultParams,
      bulletsKo: [],
    })

    const callArgs = mockExecFile.mock.calls[0]![1] as string[]
    const bulletsIdx = callArgs.indexOf('--bullets')
    const bulletsValue = callArgs[bulletsIdx + 1]!

    expect(bulletsValue).toBe('')
  })

  it('타임아웃 에러 → null 반환 (degrade)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        const err = new Error('timeout') as Error & { killed: boolean }
        err.killed = true
        cb(err, '', '')
      },
    )

    const result = await redesignImage(defaultParams)
    expect(result).toBeNull()
  })

  it('IMAGE_FONT_PATH 환경변수가 전달됨', async () => {
    process.env['IMAGE_FONT_PATH'] = '/usr/share/fonts/NanumGothic.ttf'

    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null, '', '')
      },
    )

    await redesignImage(defaultParams)

    const callOpts = mockExecFile.mock.calls[0]![2] as { env: Record<string, string> }
    expect(callOpts.env['IMAGE_FONT_PATH']).toBe('/usr/share/fonts/NanumGothic.ttf')

    delete process.env['IMAGE_FONT_PATH']
  })
})
