// =============================================
// 검색 키워드 추출기 테스트 (TDD)
// =============================================

import { extractSearchKeyword } from './search-keyword-extractor'

describe('extractSearchKeyword', () => {
  describe('노이즈 제거', () => {
    it('[무료배송] 태그 제거', () => {
      const result = extractSearchKeyword('[무료배송] 스테인리스 텀블러 500ml')
      expect(result).not.toContain('무료배송')
      expect(result).toContain('스테인리스')
      expect(result).toContain('텀블러')
    })

    it('(색상선택) 괄호 내용 제거', () => {
      const result = extractSearchKeyword('전동드릴 세트 (색상선택) 가정용')
      expect(result).not.toContain('색상선택')
      expect(result).toContain('전동드릴')
    })

    it('특가, HOT, SALE 등 마케팅 단어 제거', () => {
      const result = extractSearchKeyword('특가 HOT 무선 충전기 SALE 대박')
      expect(result).not.toContain('특가')
      expect(result).not.toContain('HOT')
      expect(result).not.toContain('SALE')
      expect(result).not.toContain('대박')
      expect(result).toContain('무선')
      expect(result).toContain('충전기')
    })

    it('당일발송, 국내배송 등 배송 관련 제거', () => {
      const result = extractSearchKeyword('[당일발송] 국내배송 LED 작업등')
      expect(result).not.toContain('당일발송')
      expect(result).not.toContain('국내배송')
      expect(result).toContain('LED')
    })
  })

  describe('스펙 보존', () => {
    it('전압 스펙 포함', () => {
      const result = extractSearchKeyword('무선 충전식 전동드릴 18V 리튬 배터리 가정용')
      expect(result).toContain('18V')
      expect(result).toContain('전동드릴')
    })

    it('출력 스펙 포함', () => {
      const result = extractSearchKeyword('고속충전기 100W USB C타입 멀티 충전기')
      expect(result).toContain('100W')
    })

    it('용량 스펙 포함 (mAh)', () => {
      const result = extractSearchKeyword('보조배터리 10000mAh 대용량 휴대용 충전기')
      expect(result).toContain('10000mAh')
    })

    it('용량 스펙 포함 (ml)', () => {
      const result = extractSearchKeyword('스테인리스 텀블러 500ml 보온보냉')
      expect(result).toContain('500ml')
    })

    it('사이즈 스펙 포함', () => {
      const result = extractSearchKeyword('소켓렌치 25mm 크롬바나듐 공구')
      expect(result).toContain('25mm')
    })
  })

  describe('핵심 키워드 추출', () => {
    it('긴 상품명에서 앞쪽 핵심 단어 추출', () => {
      const result = extractSearchKeyword(
        '토크렌치 다기능렌치 볼트 너트 풀기 육각렌치 공구'
      )
      expect(result.length).toBeLessThanOrEqual(30)
      expect(result).toContain('토크렌치')
    })

    it('최대 30자 제한', () => {
      const result = extractSearchKeyword(
        '멀티충전기 고속 PD 100W USB C타입 A타입 GaN 질화갈륨 접지형 해외겸용 여행용 어댑터'
      )
      expect(result.length).toBeLessThanOrEqual(30)
    })

    it('짧은 상품명은 그대로', () => {
      const result = extractSearchKeyword('캠핑의자')
      expect(result).toBe('캠핑의자')
    })
  })

  describe('엣지 케이스', () => {
    it('빈 문자열 → 빈 문자열', () => {
      expect(extractSearchKeyword('')).toBe('')
    })

    it('HTML 태그 제거', () => {
      const result = extractSearchKeyword('<b>전동드릴</b> 세트 <span>충전식</span>')
      expect(result).not.toContain('<b>')
      expect(result).toContain('전동드릴')
    })

    it('노이즈만 있는 경우', () => {
      const result = extractSearchKeyword('[무료배송] (색상선택)')
      // 노이즈 제거 후 빈 문자열이면 원본 fallback
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('실제 도매꾹 상품명', () => {
    it('전동드릴 비트', () => {
      const result = extractSearchKeyword(
        'PH2x25mm 미끄럼 방지 드라이버 비트 십자 전동 드릴 비트날'
      )
      expect(result).toContain('드라이버')
      expect(result).toContain('25mm')
    })

    it('디월트 임팩렌치', () => {
      const result = extractSearchKeyword(
        '디월트 임팩렌치 토크 충전 전동 임팩렌치 20V max'
      )
      expect(result).toContain('임팩렌치')
      expect(result).toContain('20V')
    })

    it('캠핑 텐트 타프', () => {
      const result = extractSearchKeyword(
        '텐트 타프 캠핑 천막 나사핀 지주핀 고정핀 말뚝 1P'
      )
      expect(result).toContain('텐트')
    })

    it('마스크 대량', () => {
      const result = extractSearchKeyword(
        '[당일배송한글박스]일회용 마스크 벌크포장 블루 화이트 블랙 모음전/와이어내장(50p단위 주문가능)'
      )
      expect(result).toContain('마스크')
      expect(result).not.toContain('당일배송')
    })
  })
})
