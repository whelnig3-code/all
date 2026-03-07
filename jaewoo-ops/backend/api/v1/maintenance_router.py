"""
정비일지 API 라우터 — SOP 절차서 조회 / 정비 수행 / 완료 제출
"""
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from domain.maintenance.services import (
    MaintenanceLogSubmitDTO,
    MaintenanceProcedureService,
    UncompletedStepsError,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])
logger = logging.getLogger(__name__)


def _get_svc(request: Request) -> MaintenanceProcedureService:
    return request.app.state.maintenance_service


# ── 절차서 조회 ───────────────────────────────────────────────────────

@router.get("/procedures")
async def list_procedures(request: Request):
    """등록된 전체 정비 절차서(SOP) 목록 반환"""
    svc = _get_svc(request)
    procs = svc.get_all_procedures()
    return [
        {
            "procedure_id":   p.procedure_id,
            "equipment_type": p.equipment_type,
            "procedure_name": p.procedure_name,
            "version":        p.version,
            "difficulty":     p.difficulty.value,
            "difficulty_label": p.difficulty_label,
            "estimated_min":  p.estimated_min,
            "tools_required": p.tools_required,
            "safety_warnings": p.safety_warnings,
            "step_count":     len(p.steps),
            "mandatory_count": len(p.mandatory_steps),
        }
        for p in procs
    ]


@router.get("/procedures/{equipment_type}")
async def get_procedure(equipment_type: str, request: Request):
    """설비 유형별 정비 절차서 상세 (단계 포함)"""
    svc = _get_svc(request)
    proc = svc.get_procedure(equipment_type)
    if not proc:
        raise HTTPException(status_code=404, detail="절차서를 찾을 수 없습니다.")
    return {
        "procedure_id":    proc.procedure_id,
        "equipment_type":  proc.equipment_type,
        "procedure_name":  proc.procedure_name,
        "version":         proc.version,
        "difficulty":      proc.difficulty.value,
        "difficulty_label": proc.difficulty_label,
        "estimated_min":   proc.estimated_min,
        "tools_required":  proc.tools_required,
        "safety_warnings": proc.safety_warnings,
        "steps": [
            {
                "step_id":          s.step_id,
                "step_no":          s.step_no,
                "step_title":       s.step_title,
                "step_description": s.step_description,
                "photo_guide_url":  s.photo_guide_url,
                "is_mandatory":     s.is_mandatory,
                "warning_note":     s.warning_note,
            }
            for s in proc.steps
        ],
    }


# ── 정비 로그 생성 (정비 시작) ─────────────────────────────────────────

class CreateLogRequest(BaseModel):
    task_id: str
    equipment_type: str
    performed_by: str
    due_date: str  # "YYYY-MM-DD"


@router.post("/logs", status_code=201)
async def create_log(body: CreateLogRequest, request: Request):
    """정비 시작 — 로그 초기화 및 체크리스트 생성"""
    svc = _get_svc(request)
    log = svc.create_log(
        task_id=body.task_id,
        equipment_type=body.equipment_type,
        performed_by=body.performed_by,
        due_date=body.due_date,
    )
    logger.info(f"[Maintenance] 로그 생성: {log.log_id[:8]}, "
                f"설비={body.equipment_type}, 담당={body.performed_by}")
    return _log_summary(log)


# ── 단계 체크 ────────────────────────────────────────────────────────

class CheckStepRequest(BaseModel):
    step_id: str
    memo: str | None = None


@router.post("/logs/{log_id}/check")
async def check_step(log_id: str, body: CheckStepRequest, request: Request):
    """절차 단계 체크 (완료 표시)"""
    svc = _get_svc(request)
    try:
        log = svc.check_step(log_id, body.step_id, body.memo)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _log_summary(log)


# ── 정비 완료 제출 ───────────────────────────────────────────────────

class SubmitLogRequest(BaseModel):
    work_summary: str | None = None
    work_detail: str | None = None
    parts_replaced: list[dict] | None = None   # [{"name": "O링", "qty": 2}]
    issues_found: str | None = None
    next_check_notes: str | None = None
    actual_minutes: int | None = None
    photo_urls: list[str] | None = None


@router.post("/logs/{log_id}/submit")
async def submit_log(log_id: str, body: SubmitLogRequest, request: Request):
    """정비 완료 제출 — 필수 단계 미체크 시 400 반환"""
    svc = _get_svc(request)
    dto = MaintenanceLogSubmitDTO(
        work_summary=body.work_summary,
        work_detail=body.work_detail,
        parts_replaced=body.parts_replaced,
        issues_found=body.issues_found,
        next_check_notes=body.next_check_notes,
        actual_minutes=body.actual_minutes,
        photo_urls=body.photo_urls,
    )
    try:
        log = svc.submit_log(log_id, dto)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except UncompletedStepsError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info(f"[Maintenance] 정비 완료 제출: {log_id[:8]}")
    return _log_detail(log)


# ── 정비 이력 조회 ───────────────────────────────────────────────────

@router.get("/logs")
async def get_log_history(task_id: str, request: Request):
    """업무(task_id) 기준 정비 이력 조회"""
    svc = _get_svc(request)
    logs = svc.get_history(task_id)
    return [_log_summary(l) for l in logs]


@router.get("/logs/{log_id}")
async def get_log(log_id: str, request: Request):
    """정비 로그 상세 조회"""
    svc = _get_svc(request)
    # log_store는 서비스 내부에 있으므로 get_history 대신 직접 접근
    log = svc._log_store.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="정비 로그를 찾을 수 없습니다.")
    return _log_detail(log)


# ── 절차서 단계 설명/사진 업데이트 (관리자) ──────────────────────────

class UpdateStepRequest(BaseModel):
    step_no: int
    description: str | None = None
    photo_guide_url: str | None = None


@router.patch("/procedures/{equipment_type}/steps")
async def update_step(equipment_type: str, body: UpdateStepRequest,
                      request: Request):
    """절차 단계 설명 및 가이드 사진 URL 업데이트 (관리자)"""
    svc = _get_svc(request)
    ok = svc.update_step(
        equipment_type=equipment_type,
        step_no=body.step_no,
        description=body.description,
        photo_guide_url=body.photo_guide_url,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="절차서 또는 단계를 찾을 수 없습니다.")
    return {"updated": True}


# ── 내부 직렬화 헬퍼 ─────────────────────────────────────────────────

def _log_summary(log) -> dict:
    checked  = sum(1 for c in log.step_checks if c.is_checked)
    total    = len(log.step_checks)
    return {
        "log_id":       log.log_id,
        "task_id":      log.task_id,
        "procedure_id": log.procedure_id,
        "performed_by": log.performed_by,
        "due_date":     log.due_date,
        "status":       log.status,
        "progress":     f"{checked}/{total}",
        "created_at":   log.created_at.isoformat(),
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
    }


def _log_detail(log) -> dict:
    base = _log_summary(log)
    base.update({
        "work_summary":     log.work_summary,
        "work_detail":      log.work_detail,
        "parts_replaced":   log.parts_replaced,
        "issues_found":     log.issues_found,
        "next_check_notes": log.next_check_notes,
        "actual_minutes":   log.actual_minutes,
        "photo_urls":       log.photo_urls,
        "step_checks": [
            {
                "check_id":   c.check_id,
                "step_id":    c.step_id,
                "step_title": c.step_title,
                "is_checked": c.is_checked,
                "checked_at": c.checked_at.isoformat() if c.checked_at else None,
                "memo":       c.memo,
            }
            for c in log.step_checks
        ],
    })
    return base
