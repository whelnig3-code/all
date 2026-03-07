"""
Task API Router — /api/v1/tasks
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from api.schemas.task_schemas import (
    EmergencyResolveRequest, EmergencyStartRequest,
    TaskCompleteRequest, TaskCreateRequest, TaskListResponse, TaskResponse,
)
from application.task_use_cases import TaskUseCases

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


def _get_task_uc(request: Request) -> TaskUseCases:
    return request.app.state.task_use_case


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    body: TaskCreateRequest,
    uc: TaskUseCases = Depends(_get_task_uc),
):
    """업무 생성"""
    task = await uc.create_task(
        title=body.title,
        task_type=body.task_type,
        assignee_id=body.assignee_id,
        team_id=body.team_id,
        created_by=body.created_by,
        due_date=body.due_date,
        description=body.description,
        priority=body.priority,
        is_urgent=body.is_urgent,
        extra=body.extra,
    )
    return _task_to_response(task)


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    status: str | None = Query(None),
    task_type: str | None = Query(None),
    assignee_id: str | None = Query(None),
    uc: TaskUseCases = Depends(_get_task_uc),
):
    """업무 목록 조회"""
    from domain.task.models import TaskStatus, TaskType
    status_enum = TaskStatus(status) if status else None
    type_enum = TaskType(task_type) if task_type else None
    tasks = uc.task_repo.get_all(
        status=status_enum,
        assignee_id=assignee_id,
        task_type=type_enum,
    )
    return TaskListResponse(
        items=[_task_to_response(t) for t in tasks],
        total=len(tasks),
    )


@router.get("/complete", response_class=HTMLResponse)
async def complete_task_via_link(
    token: str = Query(...),
    request: Request = None,
):
    """완료 링크 처리 (카카오톡 버튼 클릭 → 완료 확인 페이지)"""
    from infrastructure.security.token_service import verify_completion_token
    try:
        payload = verify_completion_token(token)
    except ValueError as e:
        return HTMLResponse(
            content=f"<h2>❌ 유효하지 않은 링크</h2><p>{e}</p>",
            status_code=400
        )

    # 중 레벨: PIN 입력 폼 제공
    task_id = payload.get("task_id", "")
    emp_id = payload.get("emp_id", "")
    return HTMLResponse(content=f"""
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>JAEWOO OPS — 업무 완료</title>
      <style>
        body {{ font-family: sans-serif; max-width: 400px; margin: 40px auto; padding: 20px; }}
        input {{ width: 100%; padding: 12px; font-size: 24px; text-align: center;
                letter-spacing: 8px; border: 2px solid #ccc; border-radius: 8px; }}
        button {{ width: 100%; padding: 14px; background: #4CAF50; color: white;
                 border: none; border-radius: 8px; font-size: 16px; cursor: pointer; margin-top: 12px; }}
        .info {{ background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 16px; }}
      </style>
    </head>
    <body>
      <h2>✅ 업무 완료 처리</h2>
      <div class="info">
        <p>본인 확인을 위해 4자리 PIN을 입력해 주세요.</p>
      </div>
      <form action="/api/v1/tasks/{task_id}/complete" method="post">
        <input type="hidden" name="token" value="{token}" />
        <input type="hidden" name="actor_id" value="{emp_id}" />
        <input type="password" name="pin" maxlength="4" placeholder="••••" autofocus />
        <button type="submit">확인</button>
      </form>
    </body>
    </html>
    """)


@router.post("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: str,
    body: TaskCompleteRequest,
    uc: TaskUseCases = Depends(_get_task_uc),
):
    """업무 완료 처리 (토큰 검증 + PIN 확인)"""
    try:
        task = await uc.complete_task(task_id, body.token, body.actor_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _task_to_response(task)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, uc: TaskUseCases = Depends(_get_task_uc)):
    task = uc.task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="업무를 찾을 수 없습니다.")
    return _task_to_response(task)


@router.post("/{task_id}/emergency/start")
async def start_emergency(
    task_id: str,
    body: EmergencyStartRequest,
    uc: TaskUseCases = Depends(_get_task_uc),
):
    try:
        task = await uc.start_emergency(task_id, body.actor_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "긴급 대응 시작", "task_id": task.task_id}


@router.post("/{task_id}/emergency/resolve")
async def resolve_emergency(
    task_id: str,
    body: EmergencyResolveRequest,
    uc: TaskUseCases = Depends(_get_task_uc),
):
    try:
        task = await uc.resolve_emergency(task_id, body.actor_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "message": "긴급 대응 완료",
        "task_id": task.task_id,
        "response_time_minutes": task.emergency_detail.response_time_minutes if task.emergency_detail else None,
    }


def _task_to_response(task) -> TaskResponse:
    return TaskResponse(
        task_id=task.task_id,
        title=task.title,
        task_type=task.task_type.value,
        status=task.status.value,
        priority=task.priority.value,
        assignee_id=task.assignee_id,
        team_id=task.team_id,
        due_date=task.due_date,
        completed_at=task.completed_at,
        evaluation_weight=task.evaluation_weight,
        is_urgent=task.is_urgent,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )
