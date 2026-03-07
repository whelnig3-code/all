"""
Notification Port — 메시징 어댑터 인터페이스 (DDD Port)
채널: 카카오 알림톡(SOLAPI) / 카카오워크 봇 / Email / Slack
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum


class ConversationType(str, Enum):
    DM = "DM"        # 1:1 개인 메시지
    GROUP = "GROUP"  # 그룹 채팅방


@dataclass
class MessagePayload:
    recipient_id: str
    template_key: str
    language: str
    variables: dict

    # 수신 채널 정보
    recipient_phone: str | None = None            # 알림톡용 전화번호
    recipient_kakaowork_id: str | None = None     # 카카오워크 DM용

    # 라우팅
    conversation_type: ConversationType = ConversationType.DM
    group_conversation_id: str | None = None      # GROUP 발송 시 대화방 ID
    mention_user_ids: list[str] = field(default_factory=list)  # @멘션 대상

    # 완료 링크
    task_id: str | None = None
    completion_url: str | None = None


@dataclass
class SendResult:
    success: bool
    external_msg_id: str | None = None
    conversation_id: str | None = None
    error_message: str | None = None


class NotificationPort(ABC):
    @abstractmethod
    async def send(self, payload: MessagePayload) -> SendResult:
        """단건 발송"""
        pass

    @abstractmethod
    async def send_batch(self, payloads: list[MessagePayload]) -> list[SendResult]:
        """집계형 일괄 발송"""
        pass
