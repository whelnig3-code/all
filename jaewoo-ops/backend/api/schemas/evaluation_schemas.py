"""
Evaluation API — Pydantic 스키마 (DTO)
"""
from datetime import datetime

from pydantic import BaseModel


class MonthlyEvalResponse(BaseModel):
    evaluation_id: str
    employee_id: str
    year_month: str
    total_assigned: int
    on_time_completed: int
    late_completed: int
    incomplete: int
    average_delay_days: float
    weighted_score: float | None
    equipment_check_score: float | None
    recurring_miss_rate: float
    emergency_avg_response: float | None
    calculated_at: datetime


class AnnualEvalResponse(BaseModel):
    evaluation_id: str
    employee_id: str
    year: int
    average_on_time_rate: float
    equipment_weighted: float | None
    recurring_miss_rate: float
    emergency_avg_response: float | None
    final_score: float
    grade: str
    calculated_at: datetime
