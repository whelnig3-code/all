"""
Task Context — 도메인 이벤트
"""
from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4


@dataclass
class DomainEvent:
    event_id: str = field(default_factory=lambda: str(uuid4()))
    occurred_at: datetime = field(default_factory=datetime.now)


@dataclass
class TaskCreatedEvent(DomainEvent):
    task_id: str = ""
    assignee_id: str = ""
    team_id: str = ""
    task_type: str = ""
    title: str = ""
    due_date: str = ""


@dataclass
class TaskCompletedEvent(DomainEvent):
    task_id: str = ""
    assignee_id: str = ""
    is_on_time: bool = True
    delay_days: int = 0


@dataclass
class TaskOverdueEvent(DomainEvent):
    task_id: str = ""
    assignee_id: str = ""
    team_id: str = ""
    task_type: str = ""
    escalation_step: int = 1


@dataclass
class EmergencyStartedEvent(DomainEvent):
    task_id: str = ""
    assignee_id: str = ""
    team_id: str = ""
    title: str = ""


@dataclass
class EmergencyResolvedEvent(DomainEvent):
    task_id: str = ""
    assignee_id: str = ""
    team_id: str = ""
    response_time_minutes: float = 0.0


@dataclass
class AbsenceRegisteredEvent(DomainEvent):
    employee_id: str = ""
    start_date: str = ""
    end_date: str = ""
    affected_task_ids: list[str] = field(default_factory=list)
