"""
Notification API Router — /api/v1/notifications
"""
from fastapi import APIRouter, Depends, Request

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("/log")
async def get_notification_log(request: Request):
    """발송 이력 조회 (Phase 1: 인메모리)"""
    uc = request.app.state.notification_use_case
    sent = list(uc._sent_nonces)
    return {"sent_count": len(sent), "nonces": sent[-20:]}  # 최근 20건


@router.post("/test")
async def send_test_notification(
    request: Request,
    employee_id: str,
    message: str = "테스트 알림입니다.",
):
    """테스트 알림 발송"""
    from domain.ports.notification_port import (
        ConversationType, MessagePayload,
    )
    uc = request.app.state.notification_use_case
    emp_repo = request.app.state.employee_repo
    employee = emp_repo.get_by_id(employee_id)
    if not employee:
        return {"error": "직원을 찾을 수 없습니다."}

    payload = MessagePayload(
        recipient_id=employee_id,
        recipient_phone=employee.phone,
        recipient_kakaowork_id=employee.kakaowork_id,
        conversation_type=ConversationType.DM,
        template_key="task_assigned",
        language=employee.language.value,
        variables={
            "담당자명": employee.name,
            "업무제목": message,
            "업무유형": "테스트",
            "마감일": "",
            "요일": "",
            "우선순위": "MEDIUM",
            "완료링크": "",
        },
    )
    result = await uc.alimtalk.send(payload)
    return {"success": result.success, "error": result.error_message}
