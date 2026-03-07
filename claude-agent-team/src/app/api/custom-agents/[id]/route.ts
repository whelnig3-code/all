import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { updateCustomAgentSchema } from "@/lib/schemas/agents";
import {
  getCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
} from "@/lib/custom-agent-store";
import { unregisterAgent } from "@/lib/agent-state";
import { refreshCustomAgentCache } from "@/config/agent-registry";

/** GET /api/custom-agents/[id] — 단일 커스텀 에이전트 조회 */
export const GET = withErrorHandler(async (
  _req: NextRequest,
  context?: unknown,
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const agent = await getCustomAgent(id);
  if (!agent) {
    throw AppError.notFound(`커스텀 에이전트를 찾을 수 없음: ${id}`);
  }

  return Response.json({ agent });
});

/** PATCH /api/custom-agents/[id] — 커스텀 에이전트 수정 */
export const PATCH = withErrorHandler(async (
  req: NextRequest,
  context?: unknown,
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await req.json();
  const parsed = updateCustomAgentSchema.safeParse(body);

  if (!parsed.success) {
    throw AppError.validationError("유효하지 않은 입력", parsed.error.flatten());
  }

  try {
    const updated = await updateCustomAgent(id, parsed.data);
    await refreshCustomAgentCache();
    return Response.json({ agent: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("찾을 수 없음")) {
      throw AppError.notFound(message);
    }
    throw err;
  }
});

/** DELETE /api/custom-agents/[id] — 커스텀 에이전트 삭제 */
export const DELETE = withErrorHandler(async (
  _req: NextRequest,
  context?: unknown,
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  try {
    await deleteCustomAgent(id);
    unregisterAgent(id);
    await refreshCustomAgentCache();
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("찾을 수 없음")) {
      throw AppError.notFound(message);
    }
    throw err;
  }
});
