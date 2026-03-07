"""
Task Repository — Excel 구현체 (Phase 1)
정기예방정비 시트 + 개인과제 시트를 Task 도메인 모델로 변환
"""
from datetime import date, datetime
from typing import Any

from domain.task.models import Priority, Task, TaskStatus, TaskType
from infrastructure.excel.excel_client import (
    ExcelClient, SHEET_MAINTENANCE, SHEET_TASK_PREFIX,
)


class TaskExcelRepository:
    def __init__(self, client: ExcelClient):
        self.client = client

    # ── 전체 조회 ──────────────────────────────

    def get_all(self, status: TaskStatus | None = None,
                assignee_id: str | None = None,
                task_type: TaskType | None = None) -> list[Task]:
        tasks = self._load_maintenance_tasks() + self._load_personal_tasks()
        if status:
            tasks = [t for t in tasks if t.status == status]
        if assignee_id:
            tasks = [t for t in tasks if t.assignee_id == assignee_id]
        if task_type:
            tasks = [t for t in tasks if t.task_type == task_type]
        return tasks

    def get_by_id(self, task_id: str) -> Task | None:
        for t in self.get_all():
            if t.task_id == task_id:
                return t
        return None

    def get_overdue(self) -> list[Task]:
        today = date.today()
        return [
            t for t in self.get_all()
            if t.due_date and t.due_date < today
            and t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.OVERDUE)
        ]

    # ── 저장/업데이트 ────────────────────────────

    def update_status(self, task_id: str, new_status: TaskStatus,
                      completed_at: datetime | None = None,
                      nonce: str | None = None) -> bool:
        updates: dict[str, Any] = {"상태": _status_to_kr(new_status)}
        if completed_at:
            updates["완료일시"] = completed_at.strftime("%Y-%m-%d %H:%M")
        # 정기예방정비 시트에서 업데이트 시도
        ok = self.client.update_row_by_id(SHEET_MAINTENANCE, "task_id", task_id, updates)
        if ok:
            return True
        # 개인과제 시트들에서 업데이트 시도
        for sheet_name in self.client.list_personal_task_sheets():
            ok = self.client.update_row_by_id(sheet_name, "task_id", task_id, updates)
            if ok:
                return True
        return False

    def add_maintenance_task(self, task: Task, extra: dict | None = None) -> None:
        rows = self.client.read_sheet(SHEET_MAINTENANCE)
        no = len(rows) + 1
        self.client.append_row(SHEET_MAINTENANCE, [
            f"{no:03d}",
            task.title,
            extra.get("설비명", "") if extra else "",
            extra.get("위치", "") if extra else "",
            extra.get("주기", "") if extra else "",
            task.assignee_id,
            extra.get("부담당자", "") if extra else "",
            extra.get("점검일", "") if extra else "",
            task.due_date.strftime("%Y-%m-%d") if task.due_date else "",
            _status_to_kr(task.status),
            "",
            task.description,
            task.task_id,
        ])

    # ── 내부 변환 ─────────────────────────────────

    def _load_maintenance_tasks(self) -> list[Task]:
        rows = self.client.read_sheet(SHEET_MAINTENANCE)
        return [self._maintenance_row_to_task(r) for r in rows if r.get("task_id")]

    def _load_personal_tasks(self) -> list[Task]:
        tasks = []
        for sheet_name in self.client.list_personal_task_sheets():
            rows = self.client.read_sheet(sheet_name)
            employee_name = sheet_name.replace(SHEET_TASK_PREFIX, "")
            for r in rows:
                if r.get("task_id"):
                    tasks.append(self._personal_row_to_task(r, employee_name))
        return tasks

    def _maintenance_row_to_task(self, row: dict) -> Task:
        status_map = {
            "대기": TaskStatus.PENDING,
            "진행중": TaskStatus.IN_PROGRESS,
            "완료": TaskStatus.COMPLETED,
            "지연": TaskStatus.OVERDUE,
            "취소": TaskStatus.CANCELLED,
        }
        due_raw = row.get("마감일")
        due_date = None
        if due_raw:
            try:
                due_date = datetime.strptime(str(due_raw), "%Y-%m-%d").date()
            except ValueError:
                pass

        return Task(
            task_id=str(row.get("task_id", "")),
            title=str(row.get("점검항목", "")),
            description=str(row.get("비고", "")),
            task_type=TaskType.EQUIPMENT,
            status=status_map.get(str(row.get("상태", "대기")), TaskStatus.PENDING),
            priority=Priority.MEDIUM,
            assignee_id=str(row.get("주담당자", "")),
            evaluation_weight=2.0,
            due_date=due_date,
        )

    def _personal_row_to_task(self, row: dict, employee_name: str) -> Task:
        status_map = {
            "대기": TaskStatus.PENDING,
            "진행": TaskStatus.IN_PROGRESS,
            "완료": TaskStatus.COMPLETED,
            "지연": TaskStatus.OVERDUE,
            "취소": TaskStatus.CANCELLED,
        }
        due_raw = row.get("마감일")
        due_date = None
        if due_raw:
            try:
                due_date = datetime.strptime(str(due_raw), "%Y-%m-%d").date()
            except ValueError:
                pass

        return Task(
            task_id=str(row.get("task_id", "")),
            title=str(row.get("과제명", "")),
            task_type=TaskType.GENERAL,
            status=status_map.get(str(row.get("상태", "대기")), TaskStatus.PENDING),
            priority=Priority.MEDIUM,
            assignee_id=employee_name,
            evaluation_weight=1.0,
            due_date=due_date,
        )


def _status_to_kr(status: TaskStatus) -> str:
    return {
        TaskStatus.PENDING: "대기",
        TaskStatus.IN_PROGRESS: "진행중",
        TaskStatus.COMPLETED: "완료",
        TaskStatus.OVERDUE: "지연",
        TaskStatus.CANCELLED: "취소",
    }.get(status, "대기")
