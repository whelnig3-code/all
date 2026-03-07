"""
Employee/Team API Router — /api/v1/employees, /api/v1/teams
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request

from api.schemas.employee_schemas import (
    AbsenceCreateRequest, AbsenceResponse, EmployeeCreateRequest,
    EmployeeResponse, TeamResponse,
)
from application.task_use_cases import TaskUseCases
from domain.organization.models import AbsenceType, Employee
from infrastructure.excel.employee_excel_repo import EmployeeExcelRepository

router = APIRouter(tags=["employees"])


def _get_employee_repo(request: Request) -> EmployeeExcelRepository:
    return request.app.state.employee_repo


def _get_task_uc(request: Request) -> TaskUseCases:
    return request.app.state.task_use_case


# ─── Employees ─────────────────────────────────────────────────────

@router.post("/api/v1/employees", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    body: EmployeeCreateRequest,
    repo: EmployeeExcelRepository = Depends(_get_employee_repo),
):
    """직원 등록"""
    from domain.organization.models import Language, Role
    employee = Employee(
        name=body.name,
        email=body.email,
        phone=body.phone,
        team_id=body.team_id,
        role=Role(body.role),
        language=Language(body.language),
        kakaowork_id=body.kakaowork_id,
        backup_employee_id=body.backup_employee_id,
        deputy_employee_id=body.deputy_employee_id,
    )
    repo.save(employee)
    return _emp_to_response(employee)


@router.get("/api/v1/employees", response_model=list[EmployeeResponse])
async def list_employees(
    repo: EmployeeExcelRepository = Depends(_get_employee_repo),
):
    """직원 목록 조회"""
    return [_emp_to_response(e) for e in repo.get_all()]


@router.get("/api/v1/employees/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: str,
    repo: EmployeeExcelRepository = Depends(_get_employee_repo),
):
    emp = repo.get_by_id(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    return _emp_to_response(emp)


@router.post("/api/v1/employees/{employee_id}/absence",
             response_model=AbsenceResponse, status_code=201)
async def register_absence(
    employee_id: str,
    body: AbsenceCreateRequest,
    repo: EmployeeExcelRepository = Depends(_get_employee_repo),
    task_uc: TaskUseCases = Depends(_get_task_uc),
):
    """연차/부재 등록 → 자동 재배정 트리거"""
    emp = repo.get_by_id(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")

    absence = emp.add_absence(
        start_date=body.start_date,
        end_date=body.end_date,
        absence_type=AbsenceType(body.absence_type),
    )

    # TODO: 해당 기간 배정 업무 자동 재배정
    # await reassignment_service.reassign_for_absence(emp, absence)

    return AbsenceResponse(
        absence_id=absence.absence_id,
        employee_id=absence.employee_id,
        start_date=absence.start_date,
        end_date=absence.end_date,
        absence_type=absence.absence_type.value,
        registered_at=absence.registered_at,
    )


# ─── Teams ───────────────────────────────────────────────────────────

@router.get("/api/v1/teams", response_model=list[TeamResponse])
async def list_teams(request: Request):
    """팀 목록 조회 (Phase 1: Excel 직원마스터에서 팀 추출)"""
    repo: EmployeeExcelRepository = request.app.state.employee_repo
    employees = repo.get_all()
    teams: dict[str, list[str]] = {}
    for e in employees:
        teams.setdefault(e.team_id, []).append(e.employee_id)

    return [
        TeamResponse(
            team_id=team_name,
            name=team_name,
            leader_id="",
            kakaowork_group_conv_id=None,
            kakaowork_manager_conv_id=None,
            members=members,
        )
        for team_name, members in teams.items()
    ]


def _emp_to_response(emp: Employee) -> EmployeeResponse:
    return EmployeeResponse(
        employee_id=emp.employee_id,
        name=emp.name,
        email=emp.email,
        phone=emp.phone,
        team_id=emp.team_id,
        role=emp.role.value,
        language=emp.language.value,
        is_active=emp.is_active,
        kakaowork_id=emp.kakaowork_id,
        backup_employee_id=emp.backup_employee_id,
    )
