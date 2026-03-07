"""
Notification Context — 알림 도메인 모델
"""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import uuid4


class Channel(str, Enum):
    KAKAO_ALIMTALK = "KAKAO_ALIMTALK"
    KAKAOWORK_BOT = "KAKAOWORK_BOT"
    EMAIL = "EMAIL"
    SLACK = "SLACK"
    SMS = "SMS"


class DeliveryStatus(str, Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"


class ConversationType(str, Enum):
    DM = "DM"
    GROUP = "GROUP"


class AggregationType(str, Enum):
    INDIVIDUAL = "INDIVIDUAL"
    BATCH = "BATCH"


@dataclass
class EscalationRule:
    rule_id: str = field(default_factory=lambda: str(uuid4()))
    policy_id: str = ""
    step: int = 1
    action: str = "NOTIFY_ASSIGNEE"
    delay_minutes: int = 0
    target_role: str = "ASSIGNEE"


@dataclass
class RoutingRule:
    rule_id: str = field(default_factory=lambda: str(uuid4()))
    event_type: str = ""
    escalation_step: int | None = None
    task_type: str | None = None
    conversation_type: ConversationType = ConversationType.DM
    target_group: str | None = None
    mention_assignee: bool = False
    description: str = ""
    priority: int = 0
    is_active: bool = True


@dataclass
class NotificationPolicy:
    """NotificationPolicy Aggregate Root"""
    policy_id: str = field(default_factory=lambda: str(uuid4()))
    task_type: str = ""
    max_daily_alerts: int = 2
    aggregation_type: AggregationType = AggregationType.BATCH
    escalation_rules: list[EscalationRule] = field(default_factory=list)
    routing_rules: list[RoutingRule] = field(default_factory=list)
    sms_fallback_enabled: bool = False


@dataclass
class NotificationLog:
    """NotificationLog Aggregate Root"""
    log_id: str = field(default_factory=lambda: str(uuid4()))
    recipient_id: str = ""
    task_id: str | None = None
    channel: Channel = Channel.KAKAO_ALIMTALK
    conversation_type: ConversationType = ConversationType.DM
    conversation_id: str | None = None
    message_template: str = ""
    rendered_message: str = ""
    language: str = "KO"
    sent_at: datetime = field(default_factory=datetime.now)
    delivery_status: DeliveryStatus = DeliveryStatus.PENDING
    nonce: str = ""
    escalation_step: int | None = None
    external_msg_id: str | None = None
    error_message: str | None = None
    retry_count: int = 0
