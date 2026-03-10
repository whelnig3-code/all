// =============================================
// OCR 텍스트 추출 모듈 테스트
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

import { ocrExtract } from './ocr'

describe('ocrExtract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('정상 JSON 응답 → 텍스트 배열 반환', async () => {
    const ocrOutput = JSON.stringify({
      lines: [
        { text: '无线蓝牙耳机', bbox: [0, 0, 100, 20], lang: 'zh' },
        { text: 'Bluetooth 5.0', bbox: [0, 20, 100, 40], lang: 'en' },
      ],
    })

    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null, ocrOutput, '')
      },
    )

    const result = await ocrExtract('/tmp/test.jpg')

    expect(result).toEqual(['无线蓝牙耳机', 'Bluetooth 5.0'])
    expect(mockExecFile).toHaveBeenCalledWith(
      'python',
      expect.arrayContaining(['--image', '/tmp/test.jpg']),
      expect.objectContaining({ timeout: 60000 }),
      expect.any(Function),
    )
  })

  it('빈 lines 배열 → 빈 배열 반환', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null, JSON.stringify({ lines: [] }), '')
      },
    )

    const result = await ocrExtract('/tmp/empty.jpg')
    expect(result).toEqual([])
  })

  it('빈 text 필드 → 필터링되어 제외', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null, JSON.stringify({
          lines: [
            { text: '유효한 텍스트', bbox: [0, 0, 100, 20], lang: 'zh' },
            { text: '', bbox: [0, 20, 100, 40], lang: 'unknown' },
          ],
        }), '')
      },
    )

    const result = await ocrExtract('/tmp/partial.jpg')
    expect(result).toEqual(['유효한 텍스트'])
  })

  it('Python 실행 에러 → 빈 배열 반환 (degrade)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(new Error('python not found'), '', 'command not found')
      },
    )

    const result = await ocrExtract('/tmp/error.jpg')
    expect(result).toEqual([])
  })

  it('JSON 파싱 실패 → 빈 배열 반환 (degrade)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null, 'invalid json output', '')
      },
    )

    const result = await ocrExtract('/tmp/badjson.jpg')
    expect(result).toEqual([])
  })

  it('타임아웃 에러 → 빈 배열 반환 (degrade)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        const err = new Error('timeout') as Error & { killed: boolean }
        err.killed = true
        cb(err, '', '')
      },
    )

    const result = await ocrExtract('/tmp/slow.jpg')
    expect(result).toEqual([])
  })
})
