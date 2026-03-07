"""
Task API — Pydantic 스키마 (DTO)
"""
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class TaskCreateRequest(BaseModel):
    title: str = Field(..., description="업무 제목")
    task_type: str = Field("GENERAL", description="GENERAL|EQUIPMENT|RECURRING|EMERGENCY")
    assignee_id: str = Field(..., description="담당자 ID")
    team_id: str = Field(..., description="팀 ID")
    created_by: str = Field(..., description="생성자 ID")
    due_date: date | None = None
    description: str = ""
    priority: str = "MEDIUM"
    is_urgent: bool = False
    extra: dict[str, Any] = Field(default_factory=dict, description="설비점검 추가 정보")


class TaskResponse(BaseModel):
    task_id: str
    title: str
    task_type: str
    status: str
    priority: str
    assignee_id: str
    team_id: str
    due_date: date | None
    completed_at: datetime | None
    evaluation_weight: float
    is_urgent: bool
    created_at: datetime
    updated_at: datetime


class TaskCompleteRequest(BaseModel):
    token: str = Field(..., description="완료 JWT 토큰")
    actor_id: str = Field(..., description="완료 처리 직원 ID")
    pin: str | None = Field(None, description="4자리 PIN (중 레벨 보안 적용 시)")


class TaskListResponse(BaseModel):
    items: list[TaskResponse]
    total: int


class EmergencyStartRequest(BaseModel):
    actor_id: str


class EmergencyResolveRequest(BaseModel):
    actor_id: str
