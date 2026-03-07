// =============================================
// 번역 모듈 단위 테스트
// translateToKorean — Ollama HTTP mock
// =============================================

import axios from 'axios'
import { translateToKorean } from './translate'

// axios 전체 mock
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('translateToKorean', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // 기본 환경변수 설정
    process.env['OLLAMA_BASE_URL'] = 'http://localhost:11434'
    process.env['TRANSLATION_MODEL'] = 'qwen2.5:7b-instruct'
  })

  it('정상 번역 성공', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { response: '한국어 번역 결과', done: true },
    })

    const result = await translateToKorean(['Hello World'])
    expect(result).toEqual(['한국어 번역 결과'])
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
  })

  it('HTTP 실패 시 원문 유지 (degrade)', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Connection refused'))

    const result = await translateToKorean(['这是中文文本'])
    // 실패 시 원문 반환
    expect(result).toEqual(['这是中文文本'])
  })

  it('빈 배열 입력 → 빈 배열 반환', async () => {
    const result = await translateToKorean([])
    expect(result).toEqual([])
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('길이 2 미만 텍스트는 번역 건너뜀 (원문 유지)', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { response: '번역됨', done: true },
    })

    const result = await translateToKorean(['A', '일반 텍스트'])
    // 'A' (길이 1)는 번역 건너뜀, '일반 텍스트'만 번역됨
    expect(result[0]).toBe('A')
    expect(result[1]).toBe('번역됨')
    expect(mockedAxios.post).toHaveBeenCalledTimes(1) // '일반 텍스트'만 번역
  })

  it('특수문자만인 텍스트는 번역 건너뜀', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { response: '번역됨', done: true },
    })

    const result = await translateToKorean(['!!!', '일반 텍스트'])
    // '!!!' (특수문자만)는 건너뜀
    expect(result[0]).toBe('!!!')
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
  })

  it('여러 텍스트 병렬 번역', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { response: '첫 번째', done: true } })
      .mockResolvedValueOnce({ data: { response: '두 번째', done: true } })

    const result = await translateToKorean(['First text', 'Second text'])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('첫 번째')
    expect(result[1]).toBe('두 번째')
  })

  it('Ollama 빈 응답 → 원문 유지', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { response: '', done: true },
    })

    const result = await translateToKorean(['原文'])
    expect(result).toEqual(['原文'])
  })
})
