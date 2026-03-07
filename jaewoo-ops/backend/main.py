"""
JAEWOO OPS — FastAPI 메인 앱 엔트리포인트 (Phase 1: Excel 기반)
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api.v1.task_router import router as task_router
from api.v1.employee_router import router as employee_router
from api.v1.evaluation_router import router as eval_router
from api.v1.notification_router import router as notif_router
from api.v1.chatbot_router import router as chatbot_router
from api.v1.calendar_router import router as calendar_router
from api.v1.maintenance_router import router as maintenance_router
from application.evaluation_use_cases import EvaluationUseCases
from application.event_handlers import InMemoryOutbox, EventBus, OutboxWorker, setup_event_handlers
from application.notification_use_cases import NotificationUseCases
from application.task_use_cases import TaskUseCases
from config import settings
from domain.maintenance.services import MaintenanceProcedureService
from infrastructure.adapters.alimtalk_adapter import KakaoAlimTalkAdapter
from infrastructure.adapters.kakao_chatbot_adapter import KakaoChatbotHandler
from infrastructure.adapters.kakaowork_adapter import KakaoWorkBotAdapter
from infrastructure.adapters.translation_adapter import TranslationAdapter
from infrastructure.calendar.calendar_generator import CalendarSubscriptionStore
from infrastructure.excel.employee_excel_repo import EmployeeExcelRepository
from infrastructure.excel.excel_client import ExcelClient
from infrastructure.excel.task_excel_repo import TaskExcelRepository
from infrastructure.scheduler.jobs import setup_scheduler
from infrastructure.scheduler.lock_guard import SchedulerLockGuard

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 앱 시작 ──────────────────────────────────────────
    logger.info("JAEWOO OPS 시작 중... (Phase 1 - Excel 모드)")

    # Excel 클라이언트 초기화
    excel_client = ExcelClient(settings.excel_file_path)

    # 리포지토리
    task_repo     = TaskExcelRepository(excel_client)
    employee_repo = EmployeeExcelRepository(excel_client)

    # 메시징 어댑터
    alimtalk = KakaoAlimTalkAdapter(
        api_key=settings.solapi_api_key,
        api_secret=settings.solapi_api_secret,
        sender_phone=settings.solapi_sender_phone,
        pf_id=settings.solapi_kakao_pf_id,
    )
    kakaowork = KakaoWorkBotAdapter(bot_token=settings.kakaowork_bot_token)

    # 유스케이스
    task_uc = TaskUseCases(task_repo=task_repo)
    notif_uc = NotificationUseCases(
        alimtalk_adapter=alimtalk,
        kakaowork_adapter=kakaowork,
        employee_repo=employee_repo,
        task_repo=task_repo,
    )
    eval_uc = EvaluationUseCases(
        task_repo=task_repo,
        employee_repo=employee_repo,
        excel_client=excel_client,
    )

    # 이벤트 버스 & Outbox
    outbox     = InMemoryOutbox()
    event_bus  = EventBus()
    setup_event_handlers(event_bus, notif_uc, outbox)
    outbox_worker = OutboxWorker(outbox, event_bus, poll_interval=5)

    # 챗봇 핸들러 (외국인 긴급신고)
    translation_adapter = TranslationAdapter(
        google_api_key=settings.google_translate_api_key
    )
    chatbot_handler = KakaoChatbotHandler(
        task_use_case=task_uc,
        notification_use_case=notif_uc,
        translation_adapter=translation_adapter,
    )

    # 캘린더 구독 토큰 저장소
    calendar_store = CalendarSubscriptionStore()

    # 정비 절차서 서비스
    maintenance_service = MaintenanceProcedureService()

    # 스케줄러 락 가드
    lock_guard = SchedulerLockGuard()

    # app.state에 저장 (라우터에서 접근)
    app.state.task_use_case        = task_uc
    app.state.notification_use_case = notif_uc
    app.state.evaluation_use_case  = eval_uc
    app.state.employee_repo        = employee_repo
    app.state.excel_client         = excel_client
    app.state.event_bus            = event_bus
    app.state.outbox               = outbox
    app.state.chatbot_handler      = chatbot_handler
    app.state.calendar_store       = calendar_store
    app.state.maintenance_service  = maintenance_service
    app.state.lock_guard           = lock_guard

    # Outbox 워커 백그라운드 태스크로 시작
    outbox_task = asyncio.create_task(outbox_worker.start())
    app.state.outbox_worker = outbox_worker
    app.state.outbox_task = outbox_task

    # 스케줄러 시작 (lock_guard 전달)
    scheduler = setup_scheduler({
        "task_use_case":        task_uc,
        "notification_use_case": notif_uc,
        "evaluation_use_case":  eval_uc,
        "lock_guard":           lock_guard,
    })
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("스케줄러 시작 완료")

    logger.info("JAEWOO OPS 준비 완료 (v1.3.0)")
    yield

    # ── 앱 종료 ──────────────────────────────────────────
    outbox_worker.stop()
    app.state.outbox_task.cancel()
    app.state.scheduler.shutdown(wait=False)
    logger.info("JAEWOO OPS 종료")


app = FastAPI(
    title="JAEWOO OPS API",
    description="농업회사법인 재우(주) 운영관리 시스템 — Phase 1 (Excel 기반)",
    version="1.3.0",
    lifespan=lifespan,
)

# CORS (개발 환경: 전체 허용, 운영 시 origin 제한)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.app_env == "development" else [settings.base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
# (task/eval/notif 라우터는 내부에 /api/v1 prefix 포함)
app.include_router(task_router)                                  # /api/v1/tasks
app.include_router(employee_router)                              # /api/v1/employees (경로에 포함)
app.include_router(eval_router)                                  # /api/v1/evaluations
app.include_router(notif_router)                                 # /api/v1/notifications
app.include_router(chatbot_router)                               # /webhook/kakao
app.include_router(calendar_router,    prefix="/api/v1")         # /api/v1/calendar
app.include_router(maintenance_router, prefix="/api/v1")         # /api/v1/maintenance


@app.get("/health")
async def health_check():
    return {
        "status":  "ok",
        "phase":   "Phase 1 (Excel)",
        "version": "1.3.0",
        "modules": [
            "task", "employee", "evaluation", "notification",
            "chatbot", "calendar", "maintenance",
        ],
    }


@app.get("/api/v1/scheduler/status")
async def scheduler_status(request: Request):
    """스케줄러 및 실행 중인 잡 상태 확인 (운영 확인용)"""
    guard: SchedulerLockGuard = request.app.state.lock_guard
    return {
        "running_jobs": guard.running_jobs(),
        "outbox_pending": len(request.app.state.outbox.get_unprocessed()),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
