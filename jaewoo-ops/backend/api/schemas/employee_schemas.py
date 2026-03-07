"""
Employee/Team API — Pydantic 스키마 (DTO)
"""
from datetime import date, datetime

from pydantic import BaseModel, Field


class EmployeeCreateRequest(BaseModel):
    name: str
    email: str
    phone: str
    team_id: str
    role: str = "STAFF"
    language: str = "KO"
    kakaowork_id: str | None = None
    backup_employee_id: str | None = None
    deputy_employee_id: str | None = None


class EmployeeResponse(BaseModel):
    employee_id: str
    name: str
    email: str
    phone: str
    team_id: str
    role: str
    language: str
    is_active: bool
    kakaowork_id: str | None
    backup_employee_id: str | None


class AbsenceCreateRequest(BaseModel):
    start_date: date
    end_date: date
    absence_type: str = "ANNUAL"


class AbsenceResponse(BaseModel):
    absence_id: str
    employee_id: str
    start_date: date
    end_date: date
    absence_type: str
    registered_at: datetime


class TeamResponse(BaseModel):
    team_id: str
    name: str
    leader_id: str
    kakaowork_group_conv_id: str | None
    kakaowork_manager_conv_id: str | None
    members: list[str]
