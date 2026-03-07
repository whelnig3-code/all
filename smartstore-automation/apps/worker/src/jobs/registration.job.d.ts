import { Worker } from 'bullmq';
import { createLogger } from '@smartstore/shared';
/**
 * 상품 등록 워커
 * - 큐에서 RegistrationJobData를 소비
 * - DB 상품 조회 → 가격 계산 → 네이버 등록 → DB 업데이트
 */
export declare function createRegistrationWorker(): Worker;
/**
 * 모든 pending 상품을 등록 큐에 추가
 */
export declare function enqueuePendingProducts(registrationQueue: import('bullmq').Queue): Promise<number>;
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
export declare function runImagePipeline(productId: string, originalImages: string | string[], productName: string, log: ReturnType<typeof createLogger>): Promise<string[]>;
/**
 * 상세 HTML 생성 (리디자인 이미지를 상단에 포함)
 * @param imageUrls 이미지 URL 배열 (첫 번째 = 대표, 나머지 = 특징 이미지)
 * @param originalDescription 기존 상품 설명
 */
export declare function buildDetailHtml(imageUrls: string[], originalDescription: string): string;
//# sourceMappingURL=registration.job.d.ts.map