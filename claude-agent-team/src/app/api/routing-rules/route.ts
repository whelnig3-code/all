import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import {
  createRoutingRuleSchema,
  updateRoutingRuleSchema,
  deleteRoutingRuleSchema,
} from "@/lib/schemas";
import {
  loadCustomRules,
  addCustomRule,
  updateCustomRule,
  deleteCustomRule,
} from "@/lib/custom-routing-rules";
import { getDefaultRoutingRules, invalidateCustomRulesCache } from "@/lib/agent-router";

/** GET: 전체 규칙 목록 (기본 + 커스텀) */
export const GET = withErrorHandler(async () => {
  const defaultRules = getDefaultRoutingRules().map((r) => ({
    ...r,
    editable: false,
  }));
  const customRules = (await loadCustomRules()).map((r) => ({
    ...r,
    editable: true,
  }));

  const allRules = [...defaultRules, ...customRules].sort(
    (a, b) => a.priority - b.priority,
  );
  return Response.json({ rules: allRules });
});

/** POST: 커스텀 규칙 추가 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = createRoutingRuleSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const rule = await addCustomRule(parsed.data);
  invalidateCustomRulesCache();
  return Response.json({ ok: true, rule });
});

/** PATCH: 커스텀 규칙 수정 */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = updateRoutingRuleSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { id, ...updates } = parsed.data;
  const ok = await updateCustomRule(id, updates);
  if (!ok) throw AppError.notFound("Custom rule not found");
  invalidateCustomRulesCache();
  return Response.json({ ok: true });
});

/** DELETE: 커스텀 규칙 삭제 */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = deleteRoutingRuleSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const ok = await deleteCustomRule(parsed.data.id);
  if (!ok) throw AppError.notFound("Custom rule not found");
  invalidateCustomRulesCache();
  return Response.json({ ok: true });
});
