import { NextRequest } from "next/server";
import { getAgentStatuses, toggleAgent, getApiStats } from "@/lib/agent-manager";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { toggleAgentSchema } from "@/lib/schemas";
import { listCustomAgents } from "@/lib/custom-agent-store";

export const GET = withErrorHandler(async () => {
  const builtinAgents = getAgentStatuses();
  const customAgents = await listCustomAgents();
  const stats = getApiStats();
  return Response.json({
    agents: builtinAgents,
    customAgents,
    stats,
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = toggleAgentSchema.safeParse(body);
  if (!parsed.success) {
    throw AppError.validationError("Invalid input", parsed.error.flatten());
  }
  const { agentId, active } = parsed.data;
  toggleAgent(agentId, active);
  return Response.json({ ok: true });
});
