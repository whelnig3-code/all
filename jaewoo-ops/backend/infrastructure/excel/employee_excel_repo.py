"""
Employee Repository — Excel 구현체 (Phase 1)
"""
from datetime import date, datetime

from domain.organization.models import (
    AbsenceSchedule, AbsenceType, Employee, Language, Role, Team,
)
from infrastructure.excel.excel_client import ExcelClient, SHEET_EMPLOYEES


class EmployeeExcelRepository:
    def __init__(self, client: ExcelClient):
        self.client = client

    def get_all(self) -> list[Employee]:
        rows = self.client.read_sheet(SHEET_EMPLOYEES)
        return [self._row_to_employee(r) for r in rows if r.get("상태") == "재직"]

    def get_by_id(self, employee_id: str) -> Employee | None:
        rows = self.client.read_sheet(SHEET_EMPLOYEES)
        for r in rows:
            if str(r.get("employee_id", "")) == employee_id:
                return self._row_to_employee(r)
        return None

    def get_by_team(self, team_name: str) -> list[Employee]:
        rows = self.client.read_sheet(SHEET_EMPLOYEES)
        return [
            self._row_to_employee(r)
            for r in rows
            if r.get("팀") == team_name and r.get("상태") == "재직"
        ]

    def save(self, employee: Employee) -> None:
        """신규 직원 추가"""
        row_count = len(self.client.read_sheet(SHEET_EMPLOYEES))
        self.client.append_row(SHEET_EMPLOYEES, [
            f"E{row_count + 1:03d}",
            employee.name,
            employee.phone,
            employee.kakaowork_id or "",
            employee.team_id,
            employee.role.value,
            employee.language.value,
            employee.backup_employee_id or "",
            "재직" if employee.is_active else "퇴직",
            employee.email,
            employee.employee_id,
        ])

    def _row_to_employee(self, row: dict) -> Employee:
        role_map = {
            "팀장": Role.TEAM_LEAD,
            "관리자": Role.MANAGER,
            "사원": Role.STAFF,
            "ADMIN": Role.ADMIN,
        }
        lang_map = {v.value: v for v in Language}
        role_val = str(row.get("직급", "사원"))
        lang_val = str(row.get("언어", "KO"))

        return Employee(
            employee_id=str(row.get("employee_id", "")),
            name=str(row.get("이름", "")),
            email=str(row.get("이메일", "")),
            phone=str(row.get("연락처", "")),
            kakaowork_id=row.get("카카오워크ID") or None,
            team_id=str(row.get("팀", "")),
            role=role_map.get(role_val, Role.STAFF),
            language=lang_map.get(lang_val, Language.KO),
            is_active=row.get("상태") == "재직",
            backup_employee_id=row.get("지정백업") or None,
        )
