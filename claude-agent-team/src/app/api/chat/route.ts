import { NextRequest } from "next/server";
import { processUserMessage } from "@/lib/agent-manager";
import { FileAttachment } from "@/types";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { getProjectBase } from "@/lib/utils/env";
import { chatRequestSchema } from "@/lib/schemas";
import { createRateLimiter, getClientIp, rateLimitHeaders, RATE_LIMIT_PRESETS } from "@/lib/rate-limiter";
import { getTenantIdFromRequest } from "@/lib/tenant/request-helpers";

// ─── Rate Limiter (chat 프리셋: 분당 10회) ─────────────────────────────────
const chatLimiter = createRateLimiter(RATE_LIMIT_PRESETS.chat);

// ─── 이미지 첨부 파일을 임시 디렉토리에 저장 ────────────────────────────────
// 에이전트(Claude CLI)가 Read 도구로 이미지 파일을 직접 읽을 수 있게 함
async function saveImageAttachments(
  attachments: FileAttachment[]
): Promise<{ name: string; tempPath: string }[]> {
  const imageAttachments = attachments.filter((a) => a.kind === "image");
  if (imageAttachments.length === 0) return [];

  const baseDir = getProjectBase();
  const tempDir = path.join(baseDir, ".agent-temp");
  await fsp.mkdir(tempDir, { recursive: true });

  // 독립적인 파일 쓰기는 병렬 처리 (Promise.all)
  const results = await Promise.all(
    imageAttachments.map(async (att) => {
      try {
        // base64 data URL에서 실제 이미지 데이터 추출
        // 형식: "data:image/jpeg;base64,/9j/4AAQ..."
        const match = att.content.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return null;
        const [, mimeType, base64Data] = match;
        const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
        const uid = crypto.randomBytes(6).toString("hex");
        const fileName = `img-${uid}.${ext}`;
        const filePath = path.join(tempDir, fileName);
        await fsp.writeFile(filePath, Buffer.from(base64Data, "base64"));
        return { name: att.name, tempPath: filePath };
      } catch (err) {
        // 저장 실패 시 경고 후 건너뜀
        console.warn("[chat/route] 이미지 저장 실패:", err instanceof Error ? err.message : err);
        return null;
      }
    })
  );
  return results.filter((r): r is { name: string; tempPath: string } => r !== null);
}

// SSE 스트리밍으로 에이전트 응답을 전달하는 채팅 API
export async function POST(req: NextRequest) {
  // Rate Limit 체크 (SSE 스트리밍이므로 withRateLimit 미들웨어 대신 직접 체크)
  const ip = getClientIp(req);
  const rateResult = chatLimiter.check(ip);
  if (!rateResult.allowed) {
    return Response.json(
      { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", retryAfterMs: rateResult.retryAfterMs } },
      { status: 429, headers: rateLimitHeaders(rateResult) },
    );
  }

  const body = await req.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { message, targetAgent, conversationId, attachments, projectDefaultAgent } = parsed.data;

  if (!message?.trim() && (!attachments || attachments.length === 0)) {
    return new Response(JSON.stringify({ error: "메시지가 비어 있습니다." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 이미지 첨부 파일을 임시 디렉토리에 저장 후 경로를 메시지에 추가
  let fullMessage = message || "";
  if (attachments && attachments.length > 0) {
    const savedImages = await saveImageAttachments(attachments);
    if (savedImages.length > 0) {
      const imgContext = savedImages
        .map((img) => `\n\n📎 **첨부 이미지**: \`${img.name}\`\n파일 경로: \`${img.tempPath}\`\n→ Read 도구로 이미지 내용을 확인하세요.`)
        .join("");
      fullMessage = fullMessage + imgContext;
    }
  }

  // SSE 응답 스트림 설정
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const tenantId = getTenantIdFromRequest(req);
        const generator = processUserMessage(
          fullMessage,
          conversationId || undefined,
          targetAgent,
          projectDefaultAgent,
          undefined,  // _hopContext (외부 API에서는 항상 undefined)
          tenantId,
        );

        for await (const event of generator) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (err) {
        const errorEvent = {
          type: "error",
          error: err instanceof Error ? err.message : "알 수 없는 오류",
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
        );
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
}
