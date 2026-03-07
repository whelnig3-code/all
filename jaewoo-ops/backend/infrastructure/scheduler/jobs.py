"""
APScheduler 정기 작업 정의
"""
import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


def setup_scheduler(app_state: dict) -> AsyncIOScheduler:
    """
    스케줄러 초기화 및 작업 등록.
    app_state에는 use_case 인스턴스들이 담겨 있습니다.
    """
    scheduler = AsyncIOScheduler(timezone="Asia/Seoul")

    # [매일 08:50] 반복업무 자동 생성
    scheduler.add_job(
        _create_recurring_tasks,
        CronTrigger(hour=8, minute=50),
        kwargs={"app_state": app_state},
        id="create_recurring_tasks",
        replace_existing=True,
    )

    # [매일 09:00] 오전 알림 발송
    scheduler.add_job(
        _send_morning_alerts,
        CronTrigger(hour=9, minute=0),
        kwargs={"app_state": app_state},
        id="morning_alerts",
        replace_existing=True,
    )

    # [매일 14:00] 오후 재알림 (미완료 반복업무)
    scheduler.add_job(
        _send_afternoon_alerts,
        CronTrigger(hour=14, minute=0),
        kwargs={"app_state": app_state},
        id="afternoon_alerts",
        replace_existing=True,
    )

    # [매 30분] 마감 초과 업무 탐지 → OVERDUE 처리
    scheduler.add_job(
        _detect_overdue_tasks,
        CronTrigger(minute="*/30"),
        kwargs={"app_state": app_state},
        id="detect_overdue",
        replace_existing=True,
    )

    # [매 30분] 에스컬레이션 단계 체크
    scheduler.add_job(
        _check_escalations,
        CronTrigger(minute="*/30"),
        kwargs={"app_state": app_state},
        id="check_escalations",
        replace_existing=True,
    )

    # [매월 1일 00:30] 전월 평가 지표 집계
    scheduler.add_job(
        _calculate_monthly_evaluation,
        CronTrigger(day=1, hour=0, minute=30),
        kwargs={"app_state": app_state},
        id="monthly_evaluation",
        replace_existing=True,
    )

    # [매년 1/1 01:00] 연간 평가 산출
    scheduler.add_job(
        _calculate_annual_evaluation,
        CronTrigger(month=1, day=1, hour=1, minute=0),
        kwargs={"app_state": app_state},
        id="annual_evaluation",
        replace_existing=True,
    )

    return scheduler


# ── 작업 구현체 (SchedulerLockGuard 적용) ──────────────────────────────

def _get_lock_guard(app_state: dict):
    """app_state에서 lock_guard 반환; 없으면 None"""
    return app_state.get("lock_guard")


async def _create_recurring_tasks(app_state: dict) -> None:
    guard = _get_lock_guard(app_state)
    if guard:
        async with guard.acquire("create_recurring_tasks") as got:
            if not got:
                return
            await _do_create_recurring(app_state)
    else:
        await _do_create_recurring(app_state)


async def _do_create_recurring(app_state: dict) -> None:
    logger.info("[Scheduler] 반복업무 자동 생성 시작")
    try:
        uc = app_state.get("task_use_case")
        if uc:
            await uc.create_recurring_tasks_for_today()
    except Exception as e:
        logger.error(f"[Scheduler] 반복업무 생성 오류: {e}")


async def _send_morning_alerts(app_state: dict) -> None:
    guard = _get_lock_guard(app_state)
    if guard:
        async with guard.acquire("morning_alerts") as got:
            if not got:
                return
            await _do_morning_alerts(app_state)
    else:
        await _do_morning_alerts(app_state)


async def _do_morning_alerts(app_state: dict) -> None:
    logger.info("[Scheduler] 오전 알림 발송 시작")
    try:
        uc = app_state.get("notification_use_case")
        if uc:
            await uc.send_daily_morning_alerts()
    except Exception as e:
        logger.error(f"[Scheduler] 오전 알림 오류: {e}")


async def _send_afternoon_alerts(app_state: dict) -> None:
    guard = _get_lock_guard(app_state)
    if guard:
        async with guard.acquire("afternoon_alerts") as got:
            if not got:
                return
            await _do_afternoon_alerts(app_state)
    else:
        await _do_afternoon_alerts(app_state)


async def _do_afternoon_alerts(app_state: dict) -> None:
    logger.info("[Scheduler] 오후 재알림 발송 시작")
    try:
        uc = app_state.get("notification_use_case")
        if uc:
            await uc.send_afternoon_reminders()
    except Exception as e:
        logger.error(f"[Scheduler] 오후 알림 오류: {e}")


async def _detect_overdue_tasks(app_state: dict) -> None:
    guard = _get_lock_guard(app_state)
    if guard:
        async with guard.acquire("detect_overdue") as got:
            if not got:
                return
            await _do_detect_overdue(app_state)
    else:
        await _do_detect_overdue(app_state)


async def _do_detect_overdue(app_state: dict) -> None:
    logger.info("[Scheduler] 마감 초과 탐지 시작")
    try:
        uc = app_state.get("task_use_case")
        if uc:
            await uc.detect_and_mark_overdue()
    except Exception as e:
        logger.error(f"[Scheduler] 마감 초과 탐지 오류: {e}")


async def _check_escalations(app_state: dict) -> None:
    guard = _get_lock_guard(app_state)
    if guard:
        async with guard.acquire("check_escalations") as got:
            if not got:
                return
            await _do_check_escalations(app_state)
    else:
        await _do_check_escalations(app_state)


async def _do_check_escalations(app_state: dict) -> None:
    logger.info("[Scheduler] 에스컬레이션 체크 시작")
    try:
        uc = app_state.get("notification_use_case")
        if uc:
            await uc.check_and_escalate()
    except Exception as e:
        logger.error(f"[Scheduler] 에스컬레이션 오류: {e}")


async def _calculate_monthly_evaluation(app_state: dict) -> None:
    logger.info("[Scheduler] 월간 평가 집계 시작")
    try:
        uc = app_state.get("evaluation_use_case")
        if uc:
            await uc.calculate_previous_month()
    except Exception as e:
        logger.error(f"[Scheduler] 월간 평가 오류: {e}")


async def _calculate_annual_evaluation(app_state: dict) -> None:
    logger.info("[Scheduler] 연간 평가 산출 시작")
    try:
        uc = app_state.get("evaluation_use_case")
        if uc:
            await uc.calculate_annual()
    except Exception as e:
        logger.error(f"[Scheduler] 연간 평가 오류: {e}")
