"""
Evaluation Context — 인사평가 도메인 모델
"""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import uuid4


class Grade(str, Enum):
    S = "S"
    A = "A"
    B = "B"
    C = "C"
    NEEDS_IMPROVEMENT = "NEEDS_IMPROVEMENT"


def _score_to_grade(score: float) -> Grade:
    if score >= 90:
        return Grade.S
    elif score >= 80:
        return Grade.A
    elif score >= 70:
        return Grade.B
    elif score >= 60:
        return Grade.C
    else:
        return Grade.NEEDS_IMPROVEMENT


@dataclass
class MonthlyEvaluation:
    """월간 평가 Aggregate Root"""
    evaluation_id: str = field(default_factory=lambda: str(uuid4()))
    employee_id: str = ""
    employee_name: str = ""   # 대시보드 표시용
    year_month: str = ""   # "YYYY-MM"
    total_assigned: int = 0
    on_time_completed: int = 0
    late_completed: int = 0
    incomplete: int = 0
    average_delay_days: float = 0.0
    weighted_score: float | None = None
    equipment_check_score: float | None = None
    recurring_miss_rate: float = 0.0      # 0.0 ~ 1.0
    emergency_avg_response: float | None = None  # 분
    calculated_at: datetime = field(default_factory=datetime.now)

    def calculate_weighted_score(self, equipment_weight: float = 2.0) -> float:
        """
        가중치 반영 점수 산출식:
          - 정시완료율 = on_time_completed / total_assigned * 100
          - 지연 감점 = average_delay_days * 2 (일당 2점)
          - 반복업무 누락 감점 = recurring_miss_rate * 20
          - 긴급업무 가점 = (30 - emergency_avg_response) / 30 * 10 (max 10점)
        """
        if self.total_assigned == 0:
            return 100.0

        on_time_rate = self.on_time_completed / self.total_assigned
        base_score = on_time_rate * 100
        delay_penalty = min(self.average_delay_days * 2, 30)
        recurring_penalty = self.recurring_miss_rate * 20
        emergency_bonus = 0.0
        if self.emergency_avg_response is not None and self.emergency_avg_response < 30:
            emergency_bonus = (30 - self.emergency_avg_response) / 30 * 10

        score = base_score - delay_penalty - recurring_penalty + emergency_bonus
        self.weighted_score = round(max(0.0, min(100.0, score)), 2)
        return self.weighted_score


@dataclass
class AnnualEvaluation:
    """연간 평가 Aggregate Root"""
    evaluation_id: str = field(default_factory=lambda: str(uuid4()))
    employee_id: str = ""
    year: int = 0
    average_on_time_rate: float = 0.0
    equipment_weighted: float | None = None
    recurring_miss_rate: float = 0.0
    emergency_avg_response: float | None = None
    final_score: float = 0.0
    grade: Grade = Grade.NEEDS_IMPROVEMENT
    calculated_at: datetime = field(default_factory=datetime.now)

    def calculate_final_score(self, monthly_evals: list[MonthlyEvaluation]) -> float:
        """
        연간 최종 점수:
          - 월간 weighted_score 평균
          - 설비점검 가중치 반영
          - 반복업무 연간 누락률
        """
        scores = [e.weighted_score for e in monthly_evals if e.weighted_score is not None]
        if not scores:
            self.final_score = 0.0
        else:
            self.final_score = round(sum(scores) / len(scores), 2)
        self.grade = _score_to_grade(self.final_score)
        return self.final_score
