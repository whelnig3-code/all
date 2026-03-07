"""
Evaluation API Router — /api/v1/evaluations
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from api.schemas.evaluation_schemas import MonthlyEvalResponse
from application.evaluation_use_cases import EvaluationUseCases

router = APIRouter(prefix="/api/v1/evaluations", tags=["evaluations"])


def _get_eval_uc(request: Request) -> EvaluationUseCases:
    return request.app.state.evaluation_use_case


@router.get("/monthly", response_model=MonthlyEvalResponse)
async def get_monthly_eval(
    employee_id: str = Query(...),
    year_month: str = Query(..., description="YYYY-MM 형식"),
    uc: EvaluationUseCases = Depends(_get_eval_uc),
):
    """월간 평가 조회"""
    result = uc.get_monthly(employee_id, year_month)
    if not result:
        raise HTTPException(status_code=404, detail="평가 데이터를 찾을 수 없습니다.")
    return MonthlyEvalResponse(
        evaluation_id=result.evaluation_id,
        employee_id=result.employee_id,
        year_month=result.year_month,
        total_assigned=result.total_assigned,
        on_time_completed=result.on_time_completed,
        late_completed=result.late_completed,
        incomplete=result.incomplete,
        average_delay_days=result.average_delay_days,
        weighted_score=result.weighted_score,
        equipment_check_score=result.equipment_check_score,
        recurring_miss_rate=result.recurring_miss_rate,
        emergency_avg_response=result.emergency_avg_response,
        calculated_at=result.calculated_at,
    )


@router.get("/monthly/all")
async def get_all_monthly_eval(
    year_month: str = Query(..., description="YYYY-MM 형식"),
    uc: EvaluationUseCases = Depends(_get_eval_uc),
):
    """전 직원 월간 평가 목록 조회 (대시보드용)"""
    results = uc.get_all_monthly(year_month)
    return [
        {
            "evaluation_id": r.evaluation_id,
            "employee_id": r.employee_id,
            "employee_name": r.employee_name if hasattr(r, "employee_name") else "",
            "year_month": r.year_month,
            "total_assigned": r.total_assigned,
            "on_time_count": r.on_time_completed,
            "delay_count": r.late_completed,
            "incomplete_count": r.incomplete,
            "average_delay_days": r.average_delay_days,
            "task_achievement_rate": f"{int((1 - (r.incomplete / r.total_assigned if r.total_assigned else 0)) * 100)}%",
            "final_score": round(r.weighted_score, 1) if r.weighted_score else 0,
            "grade": r.grade.value if hasattr(r, "grade") and r.grade else _score_to_grade(r.weighted_score),
        }
        for r in results
    ]


def _score_to_grade(score: float | None) -> str:
    if score is None:
        return "-"
    if score >= 95:
        return "S"
    elif score >= 85:
        return "A"
    elif score >= 75:
        return "B"
    elif score >= 60:
        return "C"
    return "D"


@router.post("/monthly/calculate")
async def calculate_monthly(
    uc: EvaluationUseCases = Depends(_get_eval_uc),
):
    """전월 평가 수동 집계"""
    results = await uc.calculate_previous_month()
    return {"message": f"집계 완료: {len(results)}명", "count": len(results)}
