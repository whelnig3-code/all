/**
 * 멀티 테넌시 타입 정의
 *
 * 비유: 아파트 건물의 입주자 관리 시스템.
 * 각 입주자(tenant)는 고유 ID, 이름, 출입키(apiKey)를 갖는다.
 * 출입키는 해시된 형태로만 저장되어 분실 시 재발급만 가능하다.
 */

// ── 데이터 모델 ─────────────────────────────────────────────────────────────

/** 테넌트 레코드 (레지스트리에 저장되는 형태) */
export interface TenantData {
  readonly id: string;           // UUID v4
  readonly name: string;         // 사람이 읽을 수 있는 이름
  readonly apiKeyHash: string;   // SHA-256 해시 (평문 저장 금지)
  readonly createdAt: string;    // ISO 8601
  readonly updatedAt: string;    // ISO 8601
  readonly active: boolean;      // 비활성화 가능
}

/** 테넌트 레지스트리 (docs/tenants.json의 최상위 구조) */
export interface TenantRegistry {
  readonly tenants: readonly TenantData[];
}

// ── 입력 타입 ───────────────────────────────────────────────────────────────

/** 테넌트 생성 입력 */
export interface CreateTenantInput {
  readonly name: string;
}

/** 테넌트 생성 결과 (apiKey는 생성 시 1회만 평문 반환) */
export interface CreateTenantResult {
  readonly tenant: TenantData;
  readonly apiKey: string;
}

// ── 컨텍스트 타입 ───────────────────────────────────────────────────────────

/** 요청에서 추출된 테넌트 컨텍스트 */
export interface TenantContext {
  readonly tenantId: string;
  readonly tenantName: string;
}
