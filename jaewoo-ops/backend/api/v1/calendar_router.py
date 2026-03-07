"""
캘린더 API 라우터 — Webcal 피드 / 단건 .ics
"""
import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from infrastructure.calendar.calendar_generator import (
    CalendarSubscriptionStore,
    build_ics_feed,
    build_single_event_ics,
)

router = APIRouter(tags=["calendar"])
logger = logging.getLogger(__name__)


def _get_cal_store(request: Request) -> CalendarSubscriptionStore:
    return request.app.state.calendar_store


# ── Webcal 전체 피드 ─────────────────────────────────────────────────

@router.get("/calendar/{token}/feed.ics")
async def get_calendar_feed(token: str, request: Request):
    """
    직원 전체 미완료 업무 → iCalendar 피드(.ics) 반환.
    캘린더 앱에서 Webcal 구독 URL로 등록하면 자동 동기화됩니다.
    """
    cal_store: CalendarSubscriptionStore = _get_cal_store(request)
    sub = cal_store.get_by_token(token)
    if not sub or not sub.get("is_active"):
        raise HTTPException(status_code=404, detail="유효하지 않은 캘린더 링크입니다.")

    task_repo = request.app.state.task_use_case.task_repo
    employee_repo = request.app.state.employee_repo

    employee_id = sub["employee_id"]
    employee = employee_repo.get_by_id(employee_id)
    tasks = task_repo.get_all(assignee_id=employee_id)
    active_tasks = [t for t in tasks
                    if t.status.value not in ("COMPLETED", "CANCELLED")]

    # Task → dict 변환
    task_dicts = []
    for t in active_tasks:
        completion_url = ""
        if t.completion_token:
            from config import settings
            completion_url = f"{settings.base_url}/api/v1/tasks/complete?token={t.completion_token}"
        task_dicts.append({
            "task_id":       t.task_id,
            "title":         t.title,
            "task_type":     t.task_type.value,
            "priority":      t.priority.value,
            "description":   t.description,
            "due_date":      t.due_date,
            "assignee_name": employee.name if employee else employee_id,
            "completion_url": completion_url,
        })

    ics_bytes = build_ics_feed(task_dicts, sub.get("employee_name", ""))
    logger.info(f"[Calendar] 피드 발급: employee={employee_id[:8]}, tasks={len(task_dicts)}")

    return Response(
        content=ics_bytes,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="jaewoo-ops.ics"',
            "Cache-Control":       "no-cache, no-store, must-revalidate",
        },
    )


# ── 단건 이벤트 .ics ────────────────────────────────────────────────

@router.get("/calendar/event/{task_id}.ics")
async def get_single_event(task_id: str, token: str = Query(...),
                            request: Request = None):
    """
    알림톡 [캘린더에 추가] 버튼 → 단건 .ics 다운로드.
    기기 기본 캘린더 앱으로 자동 열림.
    """
    cal_store: CalendarSubscriptionStore = _get_cal_store(request)
    sub = cal_store.get_by_token(token)
    if not sub or not sub.get("is_active"):
        raise HTTPException(status_code=403, detail="유효하지 않은 토큰입니다.")

    task_repo = request.app.state.task_use_case.task_repo
    task = task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="업무를 찾을 수 없습니다.")
    if task.assignee_id != sub["employee_id"]:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")

    from config import settings
    completion_url = (f"{settings.base_url}/api/v1/tasks/complete?token={task.completion_token}"
                      if task.completion_token else "")

    task_dict = {
        "task_id":       task.task_id,
        "title":         task.title,
        "task_type":     task.task_type.value,
        "priority":      task.priority.value,
        "description":   task.description,
        "due_date":      task.due_date,
        "completion_url": completion_url,
    }
    ics_bytes = build_single_event_ics(task_dict)

    return Response(
        content=ics_bytes,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="task-{task_id[:8]}.ics"'},
    )


# ── 구독 토큰 발급 (직원 등록 시 자동 호출) ────────────────────────────

@router.post("/calendar/subscribe/{employee_id}")
async def create_calendar_subscription(employee_id: str, request: Request):
    """직원 캘린더 구독 토큰 발급 (또는 기존 토큰 반환)"""
    cal_store: CalendarSubscriptionStore = _get_cal_store(request)
    employee_repo = request.app.state.employee_repo
    employee = employee_repo.get_by_id(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")

    from config import settings
    sub = cal_store.create_or_get(
        employee_id=employee_id,
        employee_name=employee.name,
        base_url=settings.base_url,
    )
    return {
        "feed_url":   sub["feed_url"],
        "webcal_url": sub["feed_url"],
        "token":      sub["unique_token"][:8] + "...",  # 앞 8자만 표시
    }
