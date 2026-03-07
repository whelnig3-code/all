// =============================================
// 네이버 상품 등록/수정 서비스
// - 크롤링 데이터 → 네이버 API 형식 변환
// - Rate limit 준수 (초당 1건)
// =============================================

import { createLogger } from '@smartstore/shared'
import type { NaverProduct } from '@smartstore/shared'
import { naverCommerceApi } from './commerce-api'
import type { NaverProductRegisterRequest } from './types'

const logger = createLogger('naver-product')

/** 1초 대기 (Rate limit 준수) */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 상품 등록 결과 */
export interface ProductRegistrationResult {
  success: boolean
  originProductNo?: number
  smartstoreChannelProductNo?: number
  error?: string
}

/**
 * 단일 상품 네이버 등록
 * Rate limit: 1건 등록 후 1초 대기
 */
export async function registerProductToNaver(
  product: NaverProduct
): Promise<ProductRegistrationResult> {
  try {
    logger.info('상품 등록 시작', { name: product.name })

    // 네이버 API 요청 형식으로 변환
    const request = buildRegisterRequest(product)

    const result = await naverCommerceApi.registerProduct(request)

    logger.info('상품 등록 성공', {
      name: product.name,
      originProductNo: result.originProductNo,
    })

    return {
      success: true,
      originProductNo: result.originProductNo,
      smartstoreChannelProductNo: result.smartstoreChannelProductNo,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('상품 등록 실패', { name: product.name, error: message })

    return {
      success: false,
      error: message,
    }
  } finally {
    // Rate limit 준수: 반드시 1초 대기 (CLAUDE.md 필수 규칙)
    await sleep(1000)
  }
}

/**
 * 상품 배치 등록 (목록 전체)
 * Rate limit: 각 등록 사이 1초 간격 자동 적용
 */
export async function registerProductsBatch(
  products: NaverProduct[]
): Promise<ProductRegistrationResult[]> {
  logger.info(`배치 등록 시작: ${products.length}개`)

  const results: ProductRegistrationResult[] = []

  for (const product of products) {
    // 개별 등록 (내부에서 1초 sleep)
    const result = await registerProductToNaver(product)
    results.push(result)

    const successCount = results.filter((r) => r.success).length
    logger.info(`진행 상황: ${results.length}/${products.length} (성공: ${successCount})`)
  }

  const successCount = results.filter((r) => r.success).length
  logger.info(`배치 등록 완료: 성공 ${successCount}/${products.length}`)

  return results
}

/**
 * 상품 설명 업데이트 (콘텐츠 자동 생성 후 호출)
 * @returns 성공 여부
 */
export async function updateProductDescription(
  originProductNo: number,
  description: string
): Promise<boolean> {
  try {
    await naverCommerceApi.updateProduct(originProductNo, { detailContent: description })
    logger.info('상품 설명 업데이트 성공', { originProductNo })
    await sleep(1000)
    return true
  } catch (error) {
    logger.warn('상품 설명 업데이트 실패', { originProductNo, error })
    return false
  }
}

/**
 * 상품 가격 업데이트
 */
export async function updateProductPrice(
  originProductNo: number,
  newPrice: number
): Promise<boolean> {
  try {
    await naverCommerceApi.updatePrice({ originProductNo, salePrice: newPrice })
    logger.info('가격 업데이트 성공', { originProductNo, newPrice })

    // Rate limit 준수
    await sleep(1000)
    return true
  } catch (error) {
    logger.error('가격 업데이트 실패', { originProductNo, error })
    return false
  }
}

/**
 * NaverProduct → 네이버 API 요청 형식 변환
 */
function buildRegisterRequest(product: NaverProduct): NaverProductRegisterRequest {
  const [representativeImage, ...optionalImages] = product.images

  return {
    name: product.name,
    statusType: 'SALE',
    saleType: 'NEW',
    leafCategoryId: product.category.id,
    salePrice: product.salePrice,
    stockQuantity: product.stockQuantity,

    // 배송 정보
    deliveryInfo: {
      deliveryType: 'DELIVERY',
      deliveryAttributeType: 'NORMAL',
      deliveryFee: {
        deliveryFeeType:
          product.deliveryInfo.deliveryType === 'FREE'
            ? 'FREE'
            : 'CHARGE',
        baseFee: product.deliveryInfo.deliveryFee,
      },
    },

    // 이미지 (최소 1장)
    images: representativeImage
      ? {
          representativeImage: { url: representativeImage },
          optionalImages: optionalImages
            .slice(0, 9)  // 최대 10장 (대표 1 + 추가 9)
            .map((url) => ({ url })),
        }
      : undefined,

    // 상세 설명 (HTML)
    detailContent: product.description,

    // 옵션 (있을 때만)
    optionInfo: product.options && product.options.length > 0
      ? {
          optionCombinationGroupNames: {
            optionGroupName1: product.options[0]?.groupName,
            optionGroupName2: product.options[1]?.groupName,
            optionGroupName3: product.options[2]?.groupName,
          },
          optionCombinations: product.options.flatMap((group) =>
            group.options.map((opt) => ({
              optionName1: group.groupName === product.options![0]?.groupName
                ? opt.value
                : undefined,
              optionName2: group.groupName === product.options![1]?.groupName
                ? opt.value
                : undefined,
              stockQuantity: opt.stockQuantity,
              price: opt.price,
            }))
          ),
        }
      : undefined,
  }
}
