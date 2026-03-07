import { Worker } from 'bullmq';
/** 자동 처리 결정 */
interface RefundDecision {
    action: 'approve' | 'reject' | 'manual';
    reason: string;
}
/** 자동 승인 설정 */
interface AutoApproveConfig {
    /** 자동 승인 최대 금액 (원, 초과 시 수동 처리) */
    maxAmount: number;
    /** 자동 승인 사유 키워드 */
    approveKeywords: readonly string[];
    /** 자동 거절 사유 키워드 */
    rejectKeywords: readonly string[];
}
/**
 * 환불/교환 처리 워커 생성
 */
export declare function createRefundWorker(): Worker;
/**
 * 환불/교환 요청 평가 — 자동 승인/거절/수동 처리 결정
 *
 * 비유: 편의점 교환 정책처럼 금액이 작고 사유가 명확하면 바로 승인,
 *       고가이거나 모호하면 매니저(CEO)에게 넘긴다.
 */
declare function evaluateRefundRequest(params: {
    type: 'refund' | 'exchange';
    reason: string;
    orderAmount: number;
    config: AutoApproveConfig;
}): RefundDecision;
export { evaluateRefundRequest };
//# sourceMappingURL=refund.job.d.ts.map