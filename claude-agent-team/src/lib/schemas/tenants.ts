/**
 * 테넌트 관리 API 입력 검증 스키마
 */

import { z } from "zod";

/** POST /api/tenants — 테넌트 생성 */
export const createTenantSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다").max(100, "이름은 100자 이하여야 합니다"),
});

/** PATCH /api/tenants/:id — 테넌트 수정 */
export const updateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
});
