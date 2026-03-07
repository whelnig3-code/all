"""
도메인 이벤트 핸들러 — Outbox 패턴 기반 이벤트 처리
Phase 1: 인메모리 이벤트 큐 + 폴링 워커
Phase 2 전환 시: outbox_events DB 테이블로 교체
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Coroutine

from domain.task.events import (
    AbsenceRegisteredEvent, DomainEvent,
    EmergencyResolvedEvent, EmergencyStartedEvent,
    TaskCompletedEvent, TaskCreatedEvent, TaskOverdueEvent,
)

logger = logging.getLogger(__name__)


# ── Phase 1: 인메모리 Outbox ────────────────────────────────────────

@dataclass
class OutboxEntry:
    event_id: str
    event_type: str
    aggregate_type: str
    aggregate_id: str
    payload: dict
    processed: bool = False
    retry_count: int = 0
    max_retries: int = 5
    last_error: str | None = None
    created_at: datetime = field(default_factory=datetime.now)
    processed_at: datetime | None = None


class InMemoryOutbox:
    """Phase 1 인메모리 Outbox (Phase 2에서 DB 테이블로 대체)"""

    def __init__(self):
        self._entries: list[OutboxEntry] = []

    def insert(self, event: DomainEvent, aggregate_type: str,
               aggregate_id: str, payload: dict) -> OutboxEntry:
        entry = OutboxEntry(
            event_id=event.event_id,
            event_type=type(event).__name__,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
        )
        self._entries.append(entry)
        return entry

    def get_unprocessed(self) -> list[OutboxEntry]:
        return [
            e for e in self._entries
            if not e.processed and e.retry_count < e.max_retries
        ]

    def mark_processed(self, event_id: str) -> None:
        for e in self._entries:
            if e.event_id == event_id:
                e.processed = True
                e.processed_at = datetime.now()

    def mark_failed(self, event_id: str, error: str) -> None:
        for e in self._entries:
            if e.event_id == event_id:
                e.retry_count += 1
                e.last_error = error


# ── 이벤트 버스 ─────────────────────────────────────────────────────

HandlerType = Callable[[DomainEvent], Coroutine]


class EventBus:
    """간단한 인메모리 이벤트 버스"""

    def __init__(self):
        self._handlers: dict[type, list[HandlerType]] = {}

    def subscribe(self, event_type: type, handler: HandlerType) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    async def publish(self, event: DomainEvent) -> None:
        handlers = self._handlers.get(type(event), [])
        for handler in handlers:
            try:
                await handler(event)
            except Exception as e:
                logger.error(f"[EventBus] 핸들러 오류 ({type(event).__name__}): {e}")


# ── Outbox Worker ────────────────────────────────────────────────────

class OutboxWorker:
    """
    Outbox 이벤트 폴링 워커 (5초 간격).
    Phase 1: 인메모리 OutboxEntry → 알림 발송/평가 업데이트 처리.
    Phase 2: DB outbox_events 테이블 폴링으로 교체.
    """

    def __init__(self, outbox: InMemoryOutbox, event_bus: EventBus,
                 poll_interval: int = 5):
        self.outbox = outbox
        self.event_bus = event_bus
        self.poll_interval = poll_interval
        self._running = False

    async def start(self) -> None:
        self._running = True
        logger.info("[OutboxWorker] 시작")
        while self._running:
            await self._process_pending()
            await asyncio.sleep(self.poll_interval)

    def stop(self) -> None:
        self._running = False
        logger.info("[OutboxWorker] 중지")

    async def _process_pending(self) -> None:
        entries = self.outbox.get_unprocessed()
        for entry in entries:
            try:
                await self._dispatch(entry)
                self.outbox.mark_processed(entry.event_id)
                logger.debug(f"[OutboxWorker] 처리 완료: {entry.event_type} ({entry.event_id[:8]})")
            except Exception as e:
                self.outbox.mark_failed(entry.event_id, str(e))
                logger.warning(f"[OutboxWorker] 처리 실패 ({entry.retry_count}회): {e}")

    async def _dispatch(self, entry: OutboxEntry) -> None:
        """이벤트 타입별 핸들러 호출"""
        payload = entry.payload
        event_map = {
            "TaskCreatedEvent":     self._handle_task_created,
            "TaskCompletedEvent":   self._handle_task_completed,
            "TaskOverdueEvent":     self._handle_task_overdue,
            "EmergencyStartedEvent":self._handle_emergency_started,
            "EmergencyResolvedEvent":self._handle_emergency_resolved,
            "AbsenceRegisteredEvent":self._handle_absence_registered,
        }
        handler = event_map.get(entry.event_type)
        if handler:
            await handler(payload)
        else:
            logger.debug(f"[OutboxWorker] 핸들러 없음: {entry.event_type}")

    # ── 개별 핸들러 (notification_use_case 주입 필요) ────────────────

    async def _handle_task_created(self, payload: dict) -> None:
        if self._notif_uc:
            await self._notif_uc.send_task_assigned(
                task_id=payload["task_id"],
                assignee_id=payload["assignee_id"],
            )

    async def _handle_task_completed(self, payload: dict) -> None:
        logger.info(f"[Outbox] 업무 완료: {payload.get('task_id')} (지연={not payload.get('is_on_time')})")

    async def _handle_task_overdue(self, payload: dict) -> None:
        logger.info(f"[Outbox] OVERDUE 에스컬레이션: {payload.get('task_id')}, step={payload.get('escalation_step')}")

    async def _handle_emergency_started(self, payload: dict) -> None:
        logger.info(f"[Outbox] 긴급업무 시작 알림: {payload.get('task_id')}")

    async def _handle_emergency_resolved(self, payload: dict) -> None:
        logger.info(f"[Outbox] 긴급업무 완료 알림: {payload.get('task_id')}, "
                    f"대응시간={payload.get('response_time_minutes')}분")

    async def _handle_absence_registered(self, payload: dict) -> None:
        logger.info(f"[Outbox] 부재 등록 처리: {payload.get('employee_id')} "
                    f"({payload.get('start_date')}~{payload.get('end_date')})")
        # 자동 재배정은 AbsenceReassignmentService에서 처리

    def set_notification_use_case(self, notif_uc) -> None:
        self._notif_uc = notif_uc

    _notif_uc = None


# ── 이벤트 핸들러 등록 헬퍼 ──────────────────────────────────────────

def setup_event_handlers(event_bus: EventBus, notification_uc,
                          outbox: InMemoryOutbox) -> None:
    """이벤트 버스에 핸들러를 등록합니다."""

    async def on_task_created(event: TaskCreatedEvent):
        outbox.insert(
            event=event,
            aggregate_type="TASK",
            aggregate_id=event.task_id,
            payload={
                "task_id": event.task_id,
                "assignee_id": event.assignee_id,
                "team_id": event.team_id,
                "task_type": event.task_type,
                "title": event.title,
            }
        )

    async def on_task_completed(event: TaskCompletedEvent):
        outbox.insert(
            event=event,
            aggregate_type="TASK",
            aggregate_id=event.task_id,
            payload={
                "task_id": event.task_id,
                "assignee_id": event.assignee_id,
                "is_on_time": event.is_on_time,
                "delay_days": event.delay_days,
            }
        )

    async def on_task_overdue(event: TaskOverdueEvent):
        outbox.insert(
            event=event,
            aggregate_type="TASK",
            aggregate_id=event.task_id,
            payload={
                "task_id": event.task_id,
                "assignee_id": event.assignee_id,
                "team_id": event.team_id,
                "task_type": event.task_type,
                "escalation_step": event.escalation_step,
            }
        )

    async def on_emergency_started(event: EmergencyStartedEvent):
        outbox.insert(
            event=event,
            aggregate_type="TASK",
            aggregate_id=event.task_id,
            payload={
                "task_id": event.task_id,
                "assignee_id": event.assignee_id,
                "team_id": event.team_id,
                "title": event.title,
            }
        )

    async def on_emergency_resolved(event: EmergencyResolvedEvent):
        outbox.insert(
            event=event,
            aggregate_type="TASK",
            aggregate_id=event.task_id,
            payload={
                "task_id": event.task_id,
                "assignee_id": event.assignee_id,
                "team_id": event.team_id,
                "response_time_minutes": event.response_time_minutes,
            }
        )

    async def on_absence_registered(event: AbsenceRegisteredEvent):
        outbox.insert(
            event=event,
            aggregate_type="EMPLOYEE",
            aggregate_id=event.employee_id,
            payload={
                "employee_id": event.employee_id,
                "start_date": event.start_date,
                "end_date": event.end_date,
                "affected_task_ids": event.affected_task_ids,
            }
        )

    event_bus.subscribe(TaskCreatedEvent,      on_task_created)
    event_bus.subscribe(TaskCompletedEvent,    on_task_completed)
    event_bus.subscribe(TaskOverdueEvent,      on_task_overdue)
    event_bus.subscribe(EmergencyStartedEvent, on_emergency_started)
    event_bus.subscribe(EmergencyResolvedEvent,on_emergency_resolved)
    event_bus.subscribe(AbsenceRegisteredEvent,on_absence_registered)

    logger.info("[EventBus] 핸들러 등록 완료 (6개 이벤트)")
