import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { createCustomAgentSchema } from "@/lib/schemas/agents";
import {
  listCustomAgents,
  createCustomAgent,
} from "@/lib/custom-agent-store";
import { registerAgent } from "@/lib/agent-state";
import { refreshCustomAgentCache } from "@/config/agent-registry";

/** GET /api/custom-agents — 커스텀 에이전트 목록 */
export const GET = withErrorHandler(async () => {
  const agents = await listCustomAgents();
  return Response.json({ agents });
});

/** POST /api/custom-agents — 커스텀 에이전트 생성 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = createCustomAgentSchema.safeParse(body);

  if (!parsed.success) {
    throw AppError.validationError("유효하지 않은 입력", parsed.error.flatten());
  }

  try {
    const agent = await createCustomAgent(parsed.data);

    // 상태 맵에 등록 + 캐시 갱신
    registerAgent(agent.id);
    await refreshCustomAgentCache();

    return Response.json({ agent }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("이미 존재")) {
      throw AppError.conflict(message);
    }
    if (message.includes("충돌")) {
      throw AppError.badRequest(message);
    }
    throw err;
  }
});
