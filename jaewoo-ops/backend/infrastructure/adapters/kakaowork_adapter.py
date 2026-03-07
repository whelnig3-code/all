"""
카카오워크 봇 어댑터 — 팀 단톡방(GROUP) 및 개인 DM 발송
설비점검 3차 에스컬레이션, 긴급업무, 전원부재 등 GROUP 알림에 사용
"""
import httpx

from domain.ports.notification_port import (
    ConversationType, MessagePayload, NotificationPort, SendResult,
)


class KakaoWorkBotAdapter(NotificationPort):
    """카카오워크 Bot API 어댑터"""

    def __init__(self, bot_token: str,
                 base_url: str = "https://api.kakaowork.com/v1"):
        self.bot_token = bot_token
        self.base_url = base_url

    @property
    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.bot_token}"}

    def _render_template(self, payload: MessagePayload) -> str:
        from infrastructure.excel.message_template_store import get_template
        tmpl = get_template(payload.template_key, payload.language, "KAKAOWORK_BOT")
        body = tmpl
        for k, v in payload.variables.items():
            body = body.replace(f"{{{{{k}}}}}", str(v))
        return body

    def _prepend_mentions(self, body: str, user_ids: list[str]) -> str:
        """GROUP 메시지에 @멘션 태그 추가"""
        mentions = " ".join(f"<@{uid}>" for uid in user_ids)
        return f"{mentions}\n{body}"

    def _build_blocks(self, payload: MessagePayload, message_body: str) -> list[dict]:
        """카카오워크 블록킷 UI 구성"""
        blocks: list[dict] = [{"type": "text", "text": message_body}]
        if payload.completion_url:
            blocks.append({
                "type": "button",
                "text": "✅ 완료 처리",
                "style": "primary",
                "action_type": "open_system_browser",
                "value": payload.completion_url,
            })
        return blocks

    async def _open_dm_conversation(self, kakaowork_user_id: str) -> str:
        """Bot ↔ 개인 1:1 DM 대화방 열기 → conversation_id 반환"""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{self.base_url}/conversations.open",
                headers=self._headers,
                json={"user_id": kakaowork_user_id},
            )
        return resp.json().get("conversation", {}).get("id", "")

    async def send(self, payload: MessagePayload) -> SendResult:
        # ── 1. 대화방 결정 (DM vs GROUP) ──
        if payload.conversation_type == ConversationType.GROUP:
            conv_id = payload.group_conversation_id
            if not conv_id:
                return SendResult(
                    success=False,
                    error_message="group_conversation_id가 설정되지 않았습니다."
                )
        else:
            if not payload.recipient_kakaowork_id:
                return SendResult(
                    success=False,
                    error_message="DM 발송에는 recipient_kakaowork_id가 필요합니다."
                )
            conv_id = await self._open_dm_conversation(payload.recipient_kakaowork_id)
            if not conv_id:
                return SendResult(
                    success=False,
                    error_message="DM 대화방을 열지 못했습니다."
                )

        # ── 2. 메시지 본문 구성 ──
        message_body = self._render_template(payload)
        if payload.conversation_type == ConversationType.GROUP and payload.mention_user_ids:
            message_body = self._prepend_mentions(message_body, payload.mention_user_ids)

        blocks = self._build_blocks(payload, message_body)

        # ── 3. 메시지 전송 ──
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{self.base_url}/messages.send",
                headers=self._headers,
                json={
                    "conversation_id": conv_id,
                    "text": message_body,
                    "blocks": blocks,
                },
            )

        data = resp.json()
        return SendResult(
            success=data.get("success", False),
            external_msg_id=data.get("message", {}).get("id"),
            conversation_id=conv_id,
            error_message=data.get("error", {}).get("message"),
        )

    async def send_batch(self, payloads: list[MessagePayload]) -> list[SendResult]:
        results = []
        for p in payloads:
            results.append(await self.send(p))
        return results
