import { z } from "zod";

/**
 * 로그인 스키마
 * - token: DASHBOARD_SECRET (관리자 로그인)
 * - apiKey: 테넌트 API 키 (멀티 테넌트 모드)
 * 둘 중 하나는 반드시 필요
 */
export const loginSchema = z.object({
  token: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
}).refine(
  (data) => data.token || data.apiKey,
  { message: "token 또는 apiKey 중 하나 필수" },
);
