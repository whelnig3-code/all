"""
평가 점수 계산기 v1.3
§17 설계: 가중치 기반 월간 점수 산식
  - 업무 완료율  40%
  - 기한 준수율  20%
  - 일지 품질    20%
  - 긴급 SLA    10%
  - 개인 과제    10%
"""
from dataclasses import dataclass, field
from datetime import date


# ── SLA 기준 (§17) ────────────────────────────────────────────────────
# 우선순위별 (인지→출동→해결) 분 단위
SLA_MINUTES: dict[str, tuple[int, int, int]] = {
    "CRITICAL":  (5,  15, 120),   # 5분 / 15분 / 2시간
    "URGENT":    (15, 30, 240),   # 15분 / 30분 / 4시간
    "HIGH":      (60, 120, 480),  # 1h / 2h / 8h
    "EMERGENCY": (120, 240, 1440),# 2h / 4h / 24h
}


@dataclass
class ScoreInput:
    """월간 평가 계산에 필요한 원시 지표"""
    employee_id: str
    year: int
    month: int

    # 업무 완료율 (40%)
    total_tasks: int = 0
    completed_tasks: int = 0
    # 기한 준수율 (20%) — 기한 내 완료 건수
    on_time_tasks: int = 0
    # 일지 품질 (20%) — 사진·내용 등 품질 점수 합계 / 최대 점수
    log_quality_score: float = 0.0   # 0.0 ~ 1.0 비율로 전달
    # 긴급 SLA 달성 (10%) — 달성 건/전체 긴급 건
    emergency_total: int = 0
    emergency_sla_met: int = 0
    # 개인 과제 (10%)
    personal_task_total: int = 0
    personal_task_completed: int = 0


@dataclass
class ScoreResult:
    """계산 결과 및 세부 항목"""
    employee_id: str
    year: int
    month: int
    # 항목별 점수 (각 100점 만점)
    completion_score: float = 0.0
    ontime_score: float     = 0.0
    quality_score: float    = 0.0
    sla_score: float        = 0.0
    personal_score: float   = 0.0
    # 최종 가중 합계
    final_score: float      = 0.0
    grade: str              = "C"


# 가중치
_WEIGHTS = {
    "completion": 0.40,
    "ontime":     0.20,
    "quality":    0.20,
    "sla":        0.10,
    "personal":   0.10,
}


def _score_to_grade(score: float) -> str:
    if score >= 90:
        return "S"
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    return "NEEDS_IMPROVEMENT"


def calculate_monthly_score(inp: ScoreInput) -> ScoreResult:
    """
    v1.3 가중 점수 계산.
    각 항목은 100점 만점으로 정규화 후 가중 합산.
    """
    # 1. 업무 완료율 (40%)
    completion = (
        (inp.completed_tasks / inp.total_tasks * 100)
        if inp.total_tasks > 0 else 100.0
    )

    # 2. 기한 준수율 (20%)
    ontime = (
        (inp.on_time_tasks / inp.completed_tasks * 100)
        if inp.completed_tasks > 0 else 100.0
    )

    # 3. 일지 품질 (20%) — 외부에서 0~1 비율로 전달
    quality = min(inp.log_quality_score * 100, 100.0)

    # 4. 긴급 SLA 달성 (10%)
    sla = (
        (inp.emergency_sla_met / inp.emergency_total * 100)
        if inp.emergency_total > 0 else 100.0
    )

    # 5. 개인 과제 (10%)
    personal = (
        (inp.personal_task_completed / inp.personal_task_total * 100)
        if inp.personal_task_total > 0 else 100.0
    )

    final = (
        completion * _WEIGHTS["completion"]
        + ontime    * _WEIGHTS["ontime"]
        + quality   * _WEIGHTS["quality"]
        + sla       * _WEIGHTS["sla"]
        + personal  * _WEIGHTS["personal"]
    )

    return ScoreResult(
        employee_id=inp.employee_id,
        year=inp.year,
        month=inp.month,
        completion_score=round(completion, 2),
        ontime_score=round(ontime, 2),
        quality_score=round(quality, 2),
        sla_score=round(sla, 2),
        personal_score=round(personal, 2),
        final_score=round(final, 2),
        grade=_score_to_grade(final),
    )


def check_sla_met(priority: str, actual_minutes: int, stage: str = "resolve") -> bool:
    """
    SLA 달성 여부 확인.
    stage: "ack" (인지), "dispatch" (출동), "resolve" (해결)
    """
    limits = SLA_MINUTES.get(priority.upper())
    if not limits:
        return True
    stage_map = {"ack": 0, "dispatch": 1, "resolve": 2}
    idx = stage_map.get(stage, 2)
    return actual_minutes <= limits[idx]
