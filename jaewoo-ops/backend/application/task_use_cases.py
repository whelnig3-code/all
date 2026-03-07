"""
Task Use Cases — 업무 관련 유스케이스
"""
import logging
from datetime import date, datetime

from config import settings
from domain.task.events import (
    EmergencyResolvedEvent, EmergencyStartedEvent,
    TaskCompletedEvent, TaskCreatedEvent, TaskOverdueEvent,
)
from domain.task.models import Priority, Task, TaskStatus, TaskType
from infrastructure.excel.task_excel_repo import TaskExcelRepository
from infrastructure.security.token_service import (
    create_completion_token, generate_completion_nonce, verify_completion_token,
)

logger = logging.getLogger(__name__)


class TaskUseCases:
    def __init__(self, task_repo: TaskExcelRepository,
                 event_bus=None):
        self.task_repo = task_repo
        self.event_bus = event_bus  # Phase 1: 단순 리스트 or None

    async def create_task(
        self,
        title: str,
        task_type: str,
        assignee_id: str,
        team_id: str,
        created_by: str,
        due_date: date | None = None,
        description: str = "",
        priority: str = "MEDIUM",
        is_urgent: bool = False,
        extra: dict | None = None,
    ) -> Task:
        task = Task(
            title=title,
            task_type=TaskType(task_type),
            assignee_id=assignee_id,
            team_id=team_id,
            created_by=created_by,
            due_date=due_date,
            description=description,
            priority=Priority(priority),
            is_urgent=is_urgent,
            evaluation_weight=2.0 if task_type == "EQUIPMENT" else 1.0,
        )

        # 완료 토큰 생성
        token, nonce = create_completion_token(task.task_id, assignee_id)
        task.completion_token = token
        task.completion_nonce = nonce

        # Excel 저장
        if task.task_type == TaskType.EQUIPMENT:
            self.task_repo.add_maintenance_task(task, extra)
        # TODO: 다른 타입 저장 로직

        # 이벤트 발행
        event = TaskCreatedEvent(
            task_id=task.task_id,
            assignee_id=assignee_id,
            team_id=team_id,
            task_type=task_type,
            title=title,
            due_date=str(due_date) if due_date else "",
        )
        await self._publish(event)

        return task

    async def complete_task(self, task_id: str, token: str,
                             actor_id: str) -> Task:
        """완료 처리 — JWT 검증 + Nonce 중복 체크"""
        # 1. 토큰 검증
        payload = verify_completion_token(token)
        if payload["task_id"] != task_id:
            raise ValueError("토큰의 업무 ID가 일치하지 않습니다.")
        if payload["emp_id"] != actor_id:
            raise ValueError("토큰의 담당자가 일치하지 않습니다.")

        # 2. 업무 조회
        task = self.task_repo.get_by_id(task_id)
        if not task:
            raise ValueError(f"업무를 찾을 수 없습니다: {task_id}")

        # 3. 완료 처리 (도메인 규칙)
        task.complete(actor_id=actor_id, nonce=payload["nonce"])

        # 4. Excel 업데이트
        self.task_repo.update_status(
            task_id, TaskStatus.COMPLETED,
            completed_at=task.completed_at,
            nonce=payload["nonce"],
        )

        # 5. 이벤트 발행
        is_on_time = task.due_date is None or date.today() <= task.due_date
        delay_days = 0
        if task.due_date and date.today() > task.due_date:
            delay_days = (date.today() - task.due_date).days
        event = TaskCompletedEvent(
            task_id=task_id,
            assignee_id=actor_id,
            is_on_time=is_on_time,
            delay_days=delay_days,
        )
        await self._publish(event)

        return task

    async def detect_and_mark_overdue(self) -> list[str]:
        """마감 초과 업무를 OVERDUE로 변경"""
        overdue_tasks = self.task_repo.get_overdue()
        overdue_ids = []
        for task in overdue_tasks:
            task.mark_overdue()
            self.task_repo.update_status(task.task_id, TaskStatus.OVERDUE)
            event = TaskOverdueEvent(
                task_id=task.task_id,
                assignee_id=task.assignee_id,
                team_id=task.team_id,
                task_type=task.task_type.value,
                escalation_step=1,
            )
            await self._publish(event)
            overdue_ids.append(task.task_id)
            logger.info(f"[TaskUC] OVERDUE 처리: {task.task_id} ({task.title})")
        return overdue_ids

    async def start_emergency(self, task_id: str, actor_id: str) -> Task:
        task = self.task_repo.get_by_id(task_id)
        if not task:
            raise ValueError(f"업무를 찾을 수 없습니다: {task_id}")
        task.start_emergency(actor_id)
        event = EmergencyStartedEvent(
            task_id=task_id,
            assignee_id=actor_id,
            team_id=task.team_id,
            title=task.title,
        )
        await self._publish(event)
        return task

    async def resolve_emergency(self, task_id: str, actor_id: str) -> Task:
        task = self.task_repo.get_by_id(task_id)
        if not task:
            raise ValueError(f"업무를 찾을 수 없습니다: {task_id}")
        task.resolve_emergency(actor_id)
        response_min = task.emergency_detail.response_time_minutes or 0
        event = EmergencyResolvedEvent(
            task_id=task_id,
            assignee_id=actor_id,
            team_id=task.team_id,
            response_time_minutes=response_min,
        )
        await self._publish(event)
        return task

    async def create_recurring_tasks_for_today(self) -> None:
        """오늘의 반복업무 자동 생성 (스케줄러 호출용)"""
        today_weekday = date.today().weekday()  # 0=월 ~ 6=일
        # TODO: recurring_schedules 로드 후 today_weekday 포함 스케줄 자동 생성
        logger.info(f"[TaskUC] 반복업무 자동 생성 (요일={today_weekday})")

    async def _publish(self, event) -> None:
        if self.event_bus:
            await self.event_bus.publish(event)
