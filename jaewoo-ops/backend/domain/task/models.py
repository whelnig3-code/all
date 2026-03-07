"""
Task Context — 핵심 도메인 모델
"""
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from uuid import uuid4


class TaskType(str, Enum):
    GENERAL = "GENERAL"
    EQUIPMENT = "EQUIPMENT"
    RECURRING = "RECURRING"
    EMERGENCY = "EMERGENCY"


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    OVERDUE = "OVERDUE"
    CANCELLED = "CANCELLED"


class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Frequency(str, Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"


@dataclass
class EmergencyDetail:
    started_at: datetime | None = None
    resolved_at: datetime | None = None

    @property
    def response_time_minutes(self) -> float | None:
        if self.started_at and self.resolved_at:
            delta = self.resolved_at - self.started_at
            return delta.total_seconds() / 60
        return None


@dataclass
class TaskEventLog:
    event_id: str = field(default_factory=lambda: str(uuid4()))
    task_id: str = ""
    event_type: str = ""
    occurred_at: datetime = field(default_factory=datetime.now)
    actor_id: str | None = None
    previous_status: str | None = None
    new_status: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class Task:
    """Task Aggregate Root"""
    task_id: str = field(default_factory=lambda: str(uuid4()))
    title: str = ""
    description: str = ""
    task_type: TaskType = TaskType.GENERAL
    status: TaskStatus = TaskStatus.PENDING
    priority: Priority = Priority.MEDIUM
    assignee_id: str = ""
    team_id: str = ""
    due_date: date | None = None
    completed_at: datetime | None = None
    evaluation_weight: float = 1.0
    is_urgent: bool = False
    completion_token: str | None = None
    completion_nonce: str | None = None
    original_assignee_id: str | None = None
    created_by: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    emergency_detail: EmergencyDetail | None = None
    event_log: list[TaskEventLog] = field(default_factory=list)

    # ──────────────────────────────────────
    # 비즈니스 규칙
    # ──────────────────────────────────────

    def complete(self, actor_id: str, nonce: str) -> None:
        """업무 완료 처리 (Nonce 검증 후 호출)"""
        if self.status == TaskStatus.COMPLETED:
            raise ValueError("이미 완료된 업무입니다.")
        if self.status == TaskStatus.CANCELLED:
            raise ValueError("취소된 업무는 완료 처리할 수 없습니다.")

        prev = self.status
        self.status = TaskStatus.COMPLETED
        self.completed_at = datetime.now()
        self.completion_nonce = nonce
        self.updated_at = datetime.now()
        self._log_event("COMPLETED", actor_id, prev, self.status)

    def mark_overdue(self) -> None:
        if self.status == TaskStatus.PENDING or self.status == TaskStatus.IN_PROGRESS:
            prev = self.status
            self.status = TaskStatus.OVERDUE
            self.updated_at = datetime.now()
            self._log_event("OVERDUE_DETECTED", None, prev, self.status)

    def start_emergency(self, actor_id: str) -> None:
        if self.task_type != TaskType.EMERGENCY:
            raise ValueError("긴급업무(EMERGENCY) 타입만 가능합니다.")
        self.emergency_detail = EmergencyDetail(started_at=datetime.now())
        self._log_event("EMERGENCY_STARTED", actor_id, None, None)

    def resolve_emergency(self, actor_id: str) -> None:
        if not self.emergency_detail or not self.emergency_detail.started_at:
            raise ValueError("긴급 대응이 시작되지 않았습니다.")
        self.emergency_detail.resolved_at = datetime.now()
        self._log_event("EMERGENCY_RESOLVED", actor_id, None, None)

    def _log_event(self, event_type: str, actor_id: str | None,
                   prev: TaskStatus | None, new: TaskStatus | None) -> None:
        self.event_log.append(TaskEventLog(
            task_id=self.task_id,
            event_type=event_type,
            actor_id=actor_id,
            previous_status=prev.value if prev else None,
            new_status=new.value if new else None,
        ))


@dataclass
class RecurringSchedule:
    """반복업무 스케줄 Entity"""
    schedule_id: str = field(default_factory=lambda: str(uuid4()))
    task_template: dict = field(default_factory=dict)
    frequency: Frequency = Frequency.DAILY
    active_days: list[int] = field(default_factory=lambda: [0, 1, 2, 3, 4])
    morning_alert_time: str = "09:00"
    afternoon_alert_time: str = "14:00"
    assignee_id: str = ""
    team_id: str = ""
    is_active: bool = True
