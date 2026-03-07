"""
챗봇 Webhook 라우터 — 카카오 i 오픈빌더 연동
POST /webhook/kakao  ← 오픈빌더 Webhook URL로 등록
"""
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/webhook", tags=["chatbot"])
logger = logging.getLogger(__name__)


@router.post("/kakao")
async def kakao_chatbot_webhook(request: Request):
    """
    카카오 i 오픈빌더 Webhook 수신.
    오픈빌더 콘솔에서 Webhook URL을 이 엔드포인트로 설정하세요:
      https://your-domain.com/webhook/kakao
    """
    body = await request.json()
    handler = request.app.state.chatbot_handler

    if not handler:
        logger.error("[Chatbot] chatbot_handler가 초기화되지 않았습니다.")
        return JSONResponse(
            content={"version": "2.0", "template": {"outputs": [
                {"simpleText": {"text": "서비스 점검 중입니다."}}
            ]}},
            status_code=200,
        )

    try:
        response = await handler.handle_webhook(body)
        return JSONResponse(content=response)
    except Exception as e:
        logger.error(f"[Chatbot] Webhook 처리 오류: {e}", exc_info=True)
        return JSONResponse(
            content={"version": "2.0", "template": {"outputs": [
                {"simpleText": {"text": "처리 중 오류가 발생했습니다. 다시 시도해주세요."}}
            ]}},
            status_code=200,  # 카카오 챗봇은 200 반환 필수
        )


@router.get("/kakao/status")
async def chatbot_status(request: Request):
    """챗봇 연결 상태 확인 (운영 확인용)"""
    handler = request.app.state.chatbot_handler
    pending = len(getattr(handler, '_reports', {})) if handler else 0
    return {
        "status": "ok" if handler else "not_initialized",
        "pending_sessions": pending,
    }
