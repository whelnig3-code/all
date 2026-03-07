"""
Organization Domain Services — 부재 자동 재배정
"""
import logging
from datetime import date

from domain.organization.models import Employee, Team
from domain.task.models import Task, TaskStatus

logger = logging.getLogger(__name__)


class AbsenceReassignmentService:
    """
    부재 등록 시 해당 직원의 배정 업무를 자동 재배정합니다.

    우선순위:
      1. BackupEmployeeId  — 지정 백업
      2. DeputyEmployeeId  — 지정 대리
      3. 팀 내 최소 업무량 직원
      4. 전원 부재 → 관리자 채널 에스컬레이션
    """

    def __init__(self, employee_repo, task_repo, notification_uc=None):
        self.employee_repo = employee_repo
        self.task_repo = task_repo
        self.notification_uc = notification_uc

    async def reassign_for_absence(
        self,
        absent_employee: Employee,
        start_date: date,
        end_date: date,
    ) -> list[dict]:
        """
        부재 기간 중 마감인 미완료 업무를 재배정.
        Returns: 재배정 결과 목록
        """
        # 해당 기간에 마감인 미완료 업무 수집
        tasks = self._get_tasks_in_period(absent_employee.employee_id, start_date, end_date)
        if not tasks:
            logger.info(f"[Reassign] 재배정 대상 없음: {absent_employee.name}")
            return []

        results = []
        for task in tasks:
            to_employee = await self._find_replacement(absent_employee, task)
            if to_employee:
                await self._do_reassign(task, absent_employee, to_employee)
                results.append({
                    "task_id": task.task_id,
                    "from": absent_employee.name,
                    "to": to_employee.name,
                    "reason": "ABSENCE",
                })
                logger.info(f"[Reassign] {task.title}: {absent_employee.name} → {to_employee.name}")
            else:
                # 전원 부재 → 관리자 에스컬레이션
                await self._escalate_to_manager(task, absent_employee)
                results.append({
                    "task_id": task.task_id,
                    "from": absent_employee.name,
                    "to": None,
                    "reason": "MANAGER_ESCALATION",
                })
                logger.warning(f"[Reassign] 전원 부재 에스컬레이션: {task.title}")

        return results

    def _get_tasks_in_period(self, employee_id: str,
                              start_date: date, end_date: date) -> list[Task]:
        all_tasks = self.task_repo.get_all(assignee_id=employee_id)
        return [
            t for t in all_tasks
            if t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED)
            and t.due_date is not None
            and start_date <= t.due_date <= end_date
        ]

    async def _find_replacement(self, absent: Employee, task: Task) -> Employee | None:
        # 1. 지정 백업
        if absent.backup_employee_id:
            backup = self.employee_repo.get_by_id(absent.backup_employee_id)
            if backup and backup.is_active and not backup.is_absent_on(task.due_date):
                return backup

        # 2. 지정 대리
        if absent.deputy_employee_id:
            deputy = self.employee_repo.get_by_id(absent.deputy_employee_id)
            if deputy and deputy.is_active and not deputy.is_absent_on(task.due_date):
                return deputy

        # 3. 팀 내 최소 업무량 직원
        team_members = self.employee_repo.get_by_team(absent.team_id)
        available = [
            e for e in team_members
            if e.employee_id != absent.employee_id
            and e.is_active
            and not e.is_absent_on(task.due_date)
        ]
        if available:
            # 업무량 기준 정렬
            def workload(emp: Employee) -> int:
                return len(self.task_repo.get_all(
                    assignee_id=emp.employee_id,
                    status=TaskStatus.PENDING,
                ))
            return min(available, key=workload)

        return None

    async def _do_reassign(self, task: Task,
                            from_emp: Employee, to_emp: Employee) -> None:
        task.original_assignee_id = task.original_assignee_id or from_emp.employee_id
        task.assignee_id = to_emp.employee_id
        task.updated_at = __import__('datetime').datetime.now()
        self.task_repo.update_status(task.task_id, task.status)
        # 새 담당자에게 배정 알림
        if self.notification_uc:
            await self.notification_uc.send_task_assigned(task.task_id, to_emp.employee_id)

    async def _escalate_to_manager(self, task: Task, absent: Employee) -> None:
        logger.warning(f"[Reassign] 전원 부재 — 관리자 에스컬레이션: {task.title}")
        if self.notification_uc:
            from domain.ports.notification_port import (
                ConversationType, MessagePayload,
            )
            payload = MessagePayload(
                recipient_id="ADMIN",
                conversation_type=ConversationType.GROUP,
                group_conversation_id=None,
                template_key="task_assigned",
                language="KO",
                variables={
                    "담당자명": "관리자",
                    "업무제목": f"[전원부재] {task.title}",
                    "업무유형": task.task_type.value,
                    "마감일": str(task.due_date or ""),
                    "요일": "",
                    "우선순위": task.priority.value,
                    "완료링크": "",
                },
            )
            await self.notification_uc.kakaowork.send(payload)
