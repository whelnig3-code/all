// =============================================
// 호환성 표 생성기 테스트 (TDD)
//
// 핵심 차별점: 알리/테무에서 절대 제공하지 않는 정보
// "이 소모품이 내 공구에 맞는가?" 를 한눈에 보여준다
// =============================================

import { generateCompatibilityTable, type CompatibilityInput } from './compatibility-table'

describe('generateCompatibilityTable', () => {
  describe('척 사이즈 기반 호환', () => {
    it('13mm 척 → 보쉬/마키타/디월트/계양 호환', () => {
      const html = generateCompatibilityTable({ specs: [['척', '13mm']] })
      expect(html).toContain('보쉬')
      expect(html).toContain('마키타')
      expect(html).toContain('13mm')
    })

    it('10mm 척 → 10mm 호환 기기 목록', () => {
      const html = generateCompatibilityTable({ specs: [['척', '10mm']] })
      expect(html).toContain('10mm')
    })

    it('SDS 플러스 → SDS 호환 해머드릴', () => {
      const html = generateCompatibilityTable({ specs: [['생크', 'SDS']] })
      expect(html).toContain('SDS')
      expect(html).toContain('해머')
    })
  })

  describe('디스크 직경 기반 호환', () => {
    it('100mm(4인치) → 4인치 그라인더 호환', () => {
      const html = generateCompatibilityTable({ specs: [['직경', '100mm']] })
      expect(html).toContain('4인치')
      expect(html).toContain('그라인더')
    })

    it('125mm(5인치) → 5인치 그라인더', () => {
      const html = generateCompatibilityTable({ specs: [['직경', '125mm']] })
      expect(html).toContain('5인치')
    })
  })

  describe('상품명에서 규격 추출', () => {
    it('"4인치 절단석" → 4인치 그라인더 호환표', () => {
      const html = generateCompatibilityTable({ productName: '4인치 절단석 10매' })
      expect(html).toContain('4인치')
      expect(html).toContain('그라인더')
    })

    it('"SDS 드릴비트" → SDS 호환표', () => {
      const html = generateCompatibilityTable({ productName: 'SDS플러스 드릴비트 8mm' })
      expect(html).toContain('SDS')
    })
  })

  describe('HTML 구조', () => {
    it('테이블 형태로 출력', () => {
      const html = generateCompatibilityTable({ specs: [['척', '13mm']] })
      expect(html).toContain('<table')
      expect(html).toContain('호환')
    })

    it('규격 정보 없으면 빈 문자열', () => {
      const html = generateCompatibilityTable({})
      expect(html).toBe('')
    })
  })
})
