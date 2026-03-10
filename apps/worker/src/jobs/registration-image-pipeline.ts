// =============================================
// 이미지 파이프라인 (registration.job에서 분리)
//
// OCR → 번역 → 금칙어 필터 → 리디자인 → 네이버 업로드
// 각 단계 실패 시 원본으로 degrade (등록 중단 금지)
// =============================================

import { createLogger } from '@smartstore/shared'
import {
  ocrExtract,
  translateToKorean,
  sanitizeMarketingPhrases,
  redesignImage,
} from '@smartstore/core'
import { uploadProductImages } from '@smartstore/integrations'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

/** 이미지 다운로드 (로컬 파일로 저장) */
async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
    })
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(destPath)
      response.data.pipe(writer)
      writer.on('finish', resolve)
      writer.on('error', reject)
    })
    return true
  } catch {
    return false
  }
}

/**
 * 상품명에서 제목 추출 (최대 22자, 특수문자 제거)
 */
export function extractTitleKo(productName: string): string {
  return productName
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // 특수문자 → 공백
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 22)
}

/**
 * 이미지 파이프라인 실행
 * OCR → 번역 → 금칙어 필터 → 리디자인 → 네이버 업로드
 * 각 단계 실패 시 원본으로 degrade (등록 중단 금지)
 *
 * @param productId 상품 ID
 * @param originalImages 원본 이미지 URL 배열 (JSON 문자열 또는 배열)
 * @param productName 상품명 (제목 생성용)
 * @param log 로거 인스턴스
 * @returns 최종 이미지 URL 배열 (업로드 성공 시 네이버 URL, 실패 시 원본 URL)
 */
export async function runImagePipeline(
  productId: string,
  originalImages: string | string[],
  productName: string,
  log: ReturnType<typeof createLogger>
): Promise<string[]> {
  // 원본 이미지 URL 파싱
  let imageUrls: string[]
  if (typeof originalImages === 'string') {
    try {
      imageUrls = JSON.parse(originalImages) as string[]
    } catch {
      imageUrls = originalImages ? [originalImages] : []
    }
  } else {
    imageUrls = originalImages
  }

  if (imageUrls.length === 0) {
    log.warn('이미지 없음 — 파이프라인 건너뜀', { productId })
    return []
  }

  // 대표 1장 + 서브 최대 2장 (총 최대 3장)
  const targetUrls = imageUrls.slice(0, 3)

  // 로컬 임시 디렉토리 생성
  const outputDir = process.env['IMAGE_OUTPUT_DIR'] ?? './data/generated'
  const rawDir = path.join(outputDir, productId)
  try {
    fs.mkdirSync(rawDir, { recursive: true })
  } catch {
    log.warn('이미지 디렉토리 생성 실패 — 원본 URL 사용', { productId, rawDir })
    return imageUrls
  }

  const finalPaths: string[] = []

  for (let i = 0; i < targetUrls.length; i++) {
    const url = targetUrls[i]!
    const rawPath = path.join(rawDir, `raw_${i}.jpg`)
    const cleanedPath = path.join(rawDir, `cleaned_${i}.jpg`)

    // A) 이미지 다운로드
    const downloaded = await downloadImage(url, rawPath)
    if (!downloaded) {
      log.warn('이미지 다운로드 실패 — 원본 URL 사용', { productId, url })
      finalPaths.push(rawPath) // 이후 단계에서 원본 URL로 fallback
      continue
    }

    // B-1) OCR 추출
    let texts: string[] = []
    try {
      texts = await ocrExtract(rawPath)
    } catch {
      log.warn('ocr_failed', { productId, rawPath })
      // degrade: OCR 없이 계속
    }

    // B-2) 번역
    let translated: string[] = texts
    if (texts.length > 0) {
      try {
        translated = await translateToKorean(texts)
      } catch {
        log.warn('translate_failed', { productId })
        translated = texts // 원문 유지
      }
    }

    // B-3) 금칙어 필터 → 불릿 추출
    const bulletsKo = sanitizeMarketingPhrases(translated)

    // B-4) 제목 추출
    const titleKo = extractTitleKo(productName)

    // B-5) 이미지 리디자인
    const redesigned = await redesignImage({
      inputPath: rawPath,
      outputPath: cleanedPath,
      titleKo,
      bulletsKo,
    })

    if (redesigned) {
      finalPaths.push(cleanedPath)
    } else {
      log.warn('redesign_failed — raw 이미지 사용', { productId, rawPath })
      finalPaths.push(rawPath)
    }
  }

  // C) 네이버 이미지 업로드
  let uploadedUrls: string[] = []
  try {
    uploadedUrls = await uploadProductImages(finalPaths)
  } catch {
    log.warn('naver_upload_failed — 원본 URL 사용', { productId })
  }

  // 업로드 성공 시 네이버 URL, 실패 시 원본 URL (degrade)
  if (uploadedUrls.length > 0) {
    log.info('이미지 파이프라인 완료 (네이버 URL)', {
      productId,
      count: uploadedUrls.length,
    })
    return uploadedUrls
  }

  log.warn('이미지 업로드 전체 실패 — 원본 URL 사용', { productId })
  return imageUrls
}
