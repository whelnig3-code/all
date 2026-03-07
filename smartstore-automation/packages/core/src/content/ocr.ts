// =============================================
// OCR 텍스트 추출 모듈
// - scripts/ocr_extract.py (PaddleOCR) 호출
// - 실패 시 빈 배열 반환 (등록 중단 금지)
// =============================================

import { execFile } from 'child_process'
import path from 'path'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('ocr')

/** OCR 결과 타입 */
interface OcrLine {
  text: string
  bbox: [number, number, number, number]
  lang: 'zh' | 'en' | 'unknown'
}

/** OCR 스크립트 경로 (프로젝트 루트 기준) */
const OCR_SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/ocr_extract.py'
)

/**
 * 이미지에서 텍스트 추출 (PaddleOCR)
 * @param imagePath 처리할 이미지 절대 경로
 * @returns 추출된 텍스트 배열 (실패 시 [])
 */
export async function ocrExtract(imagePath: string): Promise<string[]> {
  return new Promise((resolve) => {
    // Python 인터프리터로 OCR 스크립트 실행
    execFile(
      'python',
      [OCR_SCRIPT, '--image', imagePath],
      { timeout: 60000 }, // 최대 60초
      (error, stdout, stderr) => {
        if (error) {
          logger.warn('ocr_failed', {
            imagePath,
            reason: error.message,
            stderr: stderr.trim(),
          })
          resolve([])
          return
        }

        try {
          // JSON 파싱 후 텍스트 배열 추출
          const parsed = JSON.parse(stdout.trim()) as { lines: OcrLine[] }
          const texts = parsed.lines.map((line) => line.text).filter(Boolean)
          logger.info('ocr_success', { imagePath, count: texts.length })
          resolve(texts)
        } catch (parseError) {
          logger.warn('ocr_failed', {
            imagePath,
            reason: 'JSON 파싱 실패',
            stdout: stdout.substring(0, 200),
          })
          resolve([])
        }
      }
    )
  })
}
