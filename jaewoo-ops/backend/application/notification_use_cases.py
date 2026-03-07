"""
Notification Use Cases — 알림 발송 유스케이스
듀얼 채널 라우팅: 알림톡(DM) + 카카오워크봇(GROUP)
"""
import logging
import uuid
from datetime import date

from config import settings
from domain.notification.models import Channel, ConversationType, NotificationLog
from domain.notification.quiet_hours_checker import QuietHoursChecker
from domain.ports.notification_port import (
    ConversationType as PortConvType, MessagePayload, NotificationPort,
)
from infrastructure.excel.employee_excel_repo import EmployeeExcelRepository
from infrastructure.excel.task_excel_repo import TaskExcelRepository

logger = logging.getLogger(__name__)

# 간이 라우팅 테이블 (Phase 1: 하드코딩, Phase 2: DB 조회)
_ROUTING_RULES = {
    "TASK_ASSIGNED":         ("DM",    None),
    "TASK_REMINDER":         ("DM",    None),
    "DAILY_SUMMARY":         ("DM",    None),
    "TASK_COMPLETED":        ("DM",    None),
    ("TASK_OVERDUE", 1, "EQUIPMENT"): ("DM",  None),
    ("TASK_OVERDUE", 2, "EQUIPMENT"): ("DM",  None),
    ("TASK_OVERDUE", 3, "EQUIPMENT"): ("GROUP", "TEAM"),
    "EMERGENCY_STARTED":     ("GROUP", "TEAM"),
    "EMERGENCY_RESOLVED":    ("GROUP", "TEAM"),
    "ABSENCE_ALL_UNAVAILABLE": ("GROUP", "ADMIN_CHANNEL"),
}


class NotificationUseCases:
    def __init__(
        self,
        alimtalk_adapter: NotificationPort,
        kakaowork_adapter: NotificationPort,
        employee_repo: EmployeeExcelRepository,
        task_repo: TaskExcelRepository,
    ):
        self.alimtalk = alimtalk_adapter
        self.kakaowork = kakaowork_adapter
        self.employee_repo = employee_repo
        self.task_repo = task_repo
        self._daily_alert_counter: dict[str, int] = {}  # Phase 1: 인메모리
        self._sent_nonces: set[str] = set()             # Phase 1: 인메모리
        self._quiet_hours = QuietHoursChecker()          # 야간 알림 억제

    # ── 라우팅 결정 ────────────────────────────────

    def _route(self, event_type: str, step: int | None = None,
               task_type: str | None = None) -> tuple[str, str | None]:
        """
        Returns: (conversation_type, target_group)
        conversation_type: 'DM' | 'GROUP'
        target_group: 'TEAM' | 'ADMIN_CHANNEL' | None
        """
        key = (event_type, step, task_type) if step else event_type
        rule = _ROUTING_RULES.get(key) or _ROUTING_RULES.get(event_type)
        return rule or ("DM", None)

    # ── 알림 발송 ─────────────────────────────────

    async def send_task_assigned(self, task_id: str, assignee_id: str) -> None:
        task = self.task_repo.get_by_id(task_id)
        employee = self.employee_repo.get_by_id(assignee_id)
        if not task or not employee:
            return

        nonce = f"ASSIGNED:{task_id}:{assignee_id}"
        if not self._can_send(assignee_id, nonce, task.task_type.value):
            return

        completion_url = (
            f"{settings.base_url}/api/v1/tasks/complete"
            f"?token={task.completion_token}"
            if task.completion_token else None
        )
        payload = MessagePayload(
            recipient_id=assignee_id,
            recipient_phone=employee.phone,
            recipient_kakaowork_id=employee.kakaowork_id,
            conversation_type=PortConvType.DM,
            template_key="task_assigned",
            language=employee.language.value,
            variables={
                "담당자명": employee.name,
                "업무제목": task.title,
                "업무유형": task.task_type.value,
                "마감일": str(task.due_date or ""),
                "요일": _weekday_kr(task.due_date),
                "우선순위": task.priority.value,
                "완료링크": completion_url or "",
            },
            task_id=task_id,
            completion_url=completion_url,
        )

        await self._send_via_preferred_channel(employee, payload)
        self._mark_sent(assignee_id, nonce)
        logger.info(f"[NotifUC] 업무 배정 알림 발송: {task_id} → {assignee_id}")

    async def send_daily_morning_alerts(self) -> None:
        """오전 집계형 알림 — 오늘 마감 업무 목록"""
        today = date.today()
        all_tasks = self.task_repo.get_all()
        today_tasks = [
            t for t in all_tasks
            if t.due_date == today
            and t.status not in ("COMPLETED", "CANCELLED")
        ]

        # 담당자별 그룹핑
        by_assignee: dict[str, list] = {}
        for t in today_tasks:
            by_assignee.setdefault(t.assignee_id, []).append(t)

        for assignee_id, tasks in by_assignee.items():
            employee = self.employee_repo.get_by_id(assignee_id)
            if not employee:
                continue

            nonce = f"MORNING:{today}:{assignee_id}"
            if not self._can_send(assignee_id, nonce):
                continue

            task_list = "\n".join(
                f"• {t.title} | 마감: {t.due_date}" for t in tasks
            )
            payload = MessagePayload(
                recipient_id=assignee_id,
                recipient_phone=employee.phone,
                recipient_kakaowork_id=employee.kakaowork_id,
                conversation_type=PortConvType.DM,
                template_key="daily_summary",
                language=employee.language.value,
                variables={
                    "담당자명": employee.name,
                    "건수": str(len(tasks)),
                    "업무목록": task_list,
                    "대시보드링크": settings.base_url,
                },
            )
            await self._send_via_preferred_channel(employee, payload)
            self._mark_sent(assignee_id, nonce)

    async def send_afternoon_reminders(self) -> None:
        """오후 재알림 — 오늘 마감이지만 미완료"""
        today = date.today()
        pending = [
            t for t in self.task_repo.get_all()
            if t.due_date == today
            and t.status not in ("COMPLETED", "CANCELLED")
        ]
        for task in pending:
            nonce = f"AFTERNOON:{today}:{task.task_id}"
            if not self._can_send(task.assignee_id, nonce):
                continue
            employee = self.employee_repo.get_by_id(task.assignee_id)
            if not employee:
                continue
            payload = MessagePayload(
                recipient_id=task.assignee_id,
                recipient_phone=employee.phone,
                recipient_kakaowork_id=employee.kakaowork_id,
                conversation_type=PortConvType.DM,
                template_key="task_overdue",
                language=employee.language.value,
                variables={
                    "담당자명": employee.name,
                    "업무제목": task.title,
                    "마감일": str(task.due_date),
                    "지연일수": "0",
                    "완료링크": f"{settings.base_url}/api/v1/tasks/complete?token={task.completion_token or ''}",
                },
                task_id=task.task_id,
            )
            await self._send_via_preferred_channel(employee, payload)
            self._mark_sent(task.assignee_id, nonce)

    async def check_and_escalate(self) -> None:
        """에스컬레이션 체크 (Phase 1: 단순 구현)"""
        overdue = self.task_repo.get_all(status=None)
        from domain.task.models import TaskStatus
        for task in overdue:
            if task.status != TaskStatus.OVERDUE:
                continue
            if task.task_type.value == "EQUIPMENT":
                await self._escalate_equipment(task)

    async def _escalate_equipment(self, task) -> None:
        """설비점검 에스컬레이션 — 3단계 처리"""
        # Phase 1: 단순 에스컬레이션 (단계는 OVERDUE 업무에 1회 처리)
        # Phase 2: escalation_log 테이블로 단계 추적
        nonce = f"ESC3:{task.task_id}"
        if nonce in self._sent_nonces:
            return
        # GROUP 발송 (팀 단톡방)
        payload = MessagePayload(
            recipient_id=task.assignee_id,
            conversation_type=PortConvType.GROUP,
            group_conversation_id=None,  # Phase 1: 팀별 conv_id 미설정
            template_key="equipment_escalation_3",
            language="KO",
            variables={
                "팀장명": "팀장",
                "업무제목": task.title,
                "담당자명": task.assignee_id,
                "마감일": str(task.due_date or ""),
                "요일": _weekday_kr(task.due_date),
            },
            task_id=task.task_id,
        )
        await self.kakaowork.send(payload)
        self._sent_nonces.add(nonce)

    # ── 채널 선택 ─────────────────────────────────

    async def _send_via_preferred_channel(self, employee, payload: MessagePayload) -> None:
        """직원 선호 채널(또는 기본 채널)로 발송"""
        if employee.preferred_channel == "KAKAOWORK_BOT" and employee.kakaowork_id:
            await self.kakaowork.send(payload)
        else:
            await self.alimtalk.send(payload)

    # ── 알림 중복/과다 방지 ───────────────────────────

    def _can_send(self, employee_id: str, nonce: str,
                   task_type: str = "", priority: str = "MEDIUM") -> bool:
        if nonce in self._sent_nonces:
            return False
        if task_type == "EMERGENCY" or priority.upper() in ("CRITICAL", "EMERGENCY"):
            return True  # 긴급은 야간/횟수 제한 없이 발송
        # 야간 조용한 시간 확인
        if self._quiet_hours.should_suppress(priority):
            logger.debug(f"[NotifUC] 야간 억제 — {employee_id}")
            return False
        count = self._daily_alert_counter.get(f"{employee_id}:{date.today()}", 0)
        return count < settings.max_daily_alerts

    def _mark_sent(self, employee_id: str, nonce: str) -> None:
        self._sent_nonces.add(nonce)
        key = f"{employee_id}:{date.today()}"
        self._daily_alert_counter[key] = self._daily_alert_counter.get(key, 0) + 1


def _weekday_kr(d: date | None) -> str:
    if not d:
        return ""
    return ["월", "화", "수", "목", "금", "토", "일"][d.weekday()]
