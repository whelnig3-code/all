import { NextRequest } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";
import { getTenantWorkflowsDir } from "@/lib/tenant/tenant-paths";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";
import {
  executeWorkflow,
  type WorkflowExecutionState,
  type StepExecuteFn,
} from "@/lib/workflow-engine";
import type { WorkflowMeta } from "../../route";

/**
 * POST /api/workflows/[id]/execute
 *
 * 워크플로우를 순차 실행합니다. SSE로 각 스텝 진행 상태를 스트리밍합니다.
 * 비유: 공장 조립 라인에서 각 스테이션의 완료 신호를 실시간으로 모니터링.
 */
export const POST = withErrorHandler(async (
  req: NextRequest,
  context?: unknown
) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const tenantId = getTenantIdFromRequest(req);

  // 워크플로우 로드
  const filePath = path.join(getTenantWorkflowsDir(tenantId), `${id}.json`);
  let workflow: WorkflowMeta;
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    workflow = JSON.parse(raw);
  } catch {
    throw AppError.notFound("Workflow not found");
  }

  if (!workflow.steps || workflow.steps.length === 0) {
    throw AppError.badRequest("Workflow has no steps");
  }

  // 요청 본문에서 초기 입력 메시지 추출 (선택)
  let initialMessage = "";
  try {
    const body = await req.json();
    initialMessage = body.message ?? "";
  } catch { /* 본문 없으면 빈 메시지 */ }

  // SSE 스트리밍 응답
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(eventName: string, data: unknown) {
        const chunk = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      }

      // 각 스텝은 에이전트 이름으로 실행 — 실제 에이전트 호출 대신 placeholder
      // 향후 processUserMessage() 연동 시 이 함수를 교체
      const stepExecutor: StepExecuteFn = async (stepName, contextStr) => {
        // 시뮬레이션: 스텝 이름과 컨텍스트 길이 기반 응답 생성
        const input = contextStr || initialMessage;
        return `[${stepName}] 처리 완료. 입력 길이: ${input.length}자`;
      };

      try {
        sendEvent("start", {
          workflowId: workflow.id,
          workflowName: workflow.name,
          totalSteps: workflow.steps.length,
        });

        const result: WorkflowExecutionState = await executeWorkflow(
          workflow.id,
          workflow.steps,
          stepExecutor,
          {
            retryPolicy: { maxRetries: 1, backoffMs: 500, backoffMultiplier: 2 },
            onStepComplete: (state) => {
              const currentStep = state.steps[state.currentStepIndex - 1];
              if (currentStep) {
                sendEvent("step", {
                  stepIndex: currentStep.stepIndex,
                  stepName: currentStep.stepName,
                  status: currentStep.status,
                  output: currentStep.output,
                  durationMs: currentStep.durationMs,
                });
              }
            },
          },
        );

        sendEvent("complete", {
          status: result.status,
          totalDurationMs: result.totalDurationMs,
          steps: result.steps.map((s) => ({
            stepName: s.stepName,
            status: s.status,
            durationMs: s.durationMs,
          })),
        });
      } catch (err) {
        sendEvent("error", {
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
