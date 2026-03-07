"""
카카오 알림톡 어댑터 — SOLAPI 경유 발송
개인 카카오톡으로 DM 발송 (템플릿 심사 필수)
"""
import hashlib
import hmac
import time
from datetime import datetime

import httpx

from domain.ports.notification_port import (
    ConversationType, MessagePayload, NotificationPort, SendResult,
)


class KakaoAlimTalkAdapter(NotificationPort):
    """SOLAPI를 통한 카카오 알림톡 발송 어댑터"""

    BASE_URL = "https://api.solapi.com"

    def __init__(self, api_key: str, api_secret: str,
                 sender_phone: str, pf_id: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.sender_phone = sender_phone
        self.pf_id = pf_id

    def _build_auth_headers(self) -> dict:
        """SOLAPI HMAC 인증 헤더 생성"""
        date_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
        salt = str(time.time())
        data = f"{date_str}{salt}"
        signature = hmac.new(
            self.api_secret.encode(), data.encode(), hashlib.sha256
        ).hexdigest()
        return {
            "Authorization": (
                f"HMAC-SHA256 apiKey={self.api_key}, "
                f"date={date_str}, salt={salt}, signature={signature}"
            ),
            "Content-Type": "application/json",
        }

    def _render_template(self, payload: MessagePayload) -> str:
        """템플릿 변수 치환"""
        from infrastructure.excel.message_template_store import get_template
        tmpl = get_template(payload.template_key, payload.language, "KAKAO_ALIMTALK")
        body = tmpl
        for k, v in payload.variables.items():
            body = body.replace(f"{{{{{k}}}}}", str(v))
        return body

    async def send(self, payload: MessagePayload) -> SendResult:
        if not payload.recipient_phone:
            return SendResult(
                success=False,
                error_message="알림톡 발송에는 수신자 전화번호가 필요합니다."
            )

        message_body = self._render_template(payload)
        buttons = []
        if payload.completion_url:
            buttons.append({
                "buttonType": "WL",
                "buttonName": "완료 처리",
                "linkMobile": payload.completion_url,
                "linkPc": payload.completion_url,
            })

        request_body = {
            "message": {
                "to": payload.recipient_phone,
                "from": self.sender_phone,
                "kakaoOptions": {
                    "pfId": self.pf_id,
                    "templateId": payload.template_key,
                    "variables": payload.variables,
                    "buttons": buttons,
                },
            }
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/messages/v4/send",
                headers=self._build_auth_headers(),
                json=request_body,
            )

        data = resp.json()
        success = resp.status_code == 200
        return SendResult(
            success=success,
            external_msg_id=data.get("groupId"),
            error_message=None if success else str(data.get("errorMessage", data)),
        )

    async def send_batch(self, payloads: list[MessagePayload]) -> list[SendResult]:
        results = []
        for p in payloads:
            results.append(await self.send(p))
        return results
