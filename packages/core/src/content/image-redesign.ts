// =============================================
// 이미지 리디자인 모듈
// - scripts/redesign_image.py (Pillow) 호출
// - 성공: outputPath 반환 / 실패: null 반환 (등록 중단 금지)
// =============================================

import { execFile } from 'child_process'
import path from 'path'
import { createLogger } from '@smartstore/shared'

const logger = createLogger('image-redesign')

/** 리디자인 스크립트 경로 */
const REDESIGN_SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/redesign_image.py'
)

/** 이미지 리디자인 파라미터 */
export interface RedesignImageParams {
  inputPath: string
  outputPath: string
  titleKo: string
  bulletsKo: string[]
}

/**
 * 이미지에 한국어 텍스트 박스 삽입 (Pillow)
 * @returns 성공 시 outputPath, 실패 시 null (degrade)
 */
export async function redesignImage(
  params: RedesignImageParams
): Promise<string | null> {
  const { inputPath, outputPath, titleKo, bulletsKo } = params

  // 불릿 최대 3개, 쉼표로 결합
  const bulletsArg = bulletsKo.slice(0, 3).join(',')

  return new Promise((resolve) => {
    execFile(
      'python',
      [
        REDESIGN_SCRIPT,
        '--input', inputPath,
        '--output', outputPath,
        '--title', titleKo,
        '--bullets', bulletsArg,
      ],
      {
        timeout: 120000, // 최대 2분 (고해상도 이미지 처리 고려)
        env: {
          ...process.env,
          // 한글 폰트 경로 전달
          IMAGE_FONT_PATH: process.env['IMAGE_FONT_PATH'] ?? '',
        },
      },
      (error, _stdout, stderr) => {
        if (error) {
          logger.warn('redesign_failed', {
            inputPath,
            reason: error.message,
            stderr: stderr.trim().substring(0, 300),
          })
          resolve(null) // 실패 시 null 반환 (degrade)
          return
        }

        logger.info('redesign_success', { outputPath })
        resolve(outputPath)
      }
    )
  })
}
