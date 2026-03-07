"""
정비일지 도메인 서비스 — SOP 절차서 조회/제출
"""
import logging
from dataclasses import dataclass

from domain.maintenance.models import (
    Difficulty, MaintenanceLogDetail, MaintenanceProcedure,
    MaintenanceProcedureStep, MaintenanceStepCheck,
)

logger = logging.getLogger(__name__)


class UncompletedStepsError(Exception):
    """필수 절차 단계 미완료"""
    pass


@dataclass
class MaintenanceLogSubmitDTO:
    work_summary: str | None = None
    work_detail: str | None = None
    parts_replaced: list[dict] | None = None
    issues_found: str | None = None
    next_check_notes: str | None = None
    actual_minutes: int | None = None
    photo_urls: list[str] | None = None


class MaintenanceProcedureService:
    """
    절차서 조회 및 정비일지 제출 서비스.
    Phase 1: 인메모리 프로시저 저장소 사용.
    """

    def __init__(self, procedure_store: dict | None = None):
        # key: equipment_type → MaintenanceProcedure
        self._store: dict[str, MaintenanceProcedure] = procedure_store or {}
        self._log_store: dict[str, MaintenanceLogDetail] = {}
        self._initialize_defaults()

    def _initialize_defaults(self) -> None:
        """기본 절차서 초기 데이터 (내용은 차후 등록)"""
        defaults = [
            ("양액탱크펌프", "양액펌프 월간 정기점검", Difficulty.BEGINNER, 30,
             ["드라이버", "스패너 10mm"], ["전원 차단 필수"],
             ["전원 차단 및 잠금 확인", "펌프 외관 이상 육안 점검",
              "임펠러 회전 이물질 확인", "배관 연결부 누수 점검",
              "시운전 및 유량 확인", "점검 결과 기록 및 사진 촬영"]),

            ("환기팬", "환기팬 주간 청소 및 점검", Difficulty.BEGINNER, 20,
             ["솔", "청소 천"], ["팬 정지 확인"],
             ["팬 전원 차단", "팬 블레이드 오염 확인", "이물질 청소",
              "베어링 윤활 상태 확인", "시운전"]),

            ("살수노즐", "살수노즐 막힘 점검 및 세척", Difficulty.BEGINNER, 15,
             ["노즐렌치", "물통"], ["수압 확인 후 작업"],
             ["수압 차단", "노즐 분리", "막힘 여부 확인",
              "물/공기로 세척", "재조립 및 누수 확인"]),

            ("전기패널", "전기패널 월간 점검", Difficulty.EXPERT, 45,
             ["테스터기", "절연장갑"], ["반드시 전문가 수행", "감전 위험"],
             ["보호구 착용 확인", "외관 손상 육안 검사",
              "각 차단기 작동 상태 확인", "접지 상태 확인",
              "이상 발열 여부 확인", "점검 결과 기록"]),
        ]
        for equip_type, name, diff, mins, tools, warnings, step_titles in defaults:
            proc = MaintenanceProcedure(
                equipment_type=equip_type,
                procedure_name=name,
                difficulty=diff,
                estimated_min=mins,
                tools_required=tools,
                safety_warnings=warnings,
            )
            for title in step_titles:
                proc.add_step(title)
            self._store[equip_type] = proc

    def get_procedure(self, equipment_type: str) -> MaintenanceProcedure | None:
        return self._store.get(equipment_type)

    def get_all_procedures(self) -> list[MaintenanceProcedure]:
        return [p for p in self._store.values() if p.is_active]

    def create_log(self, task_id: str, equipment_type: str,
                   performed_by: str, due_date: str) -> MaintenanceLogDetail:
        """정비 로그 초기화 (정비 시작 시 호출)"""
        proc = self.get_procedure(equipment_type)
        log = MaintenanceLogDetail(
            task_id=task_id,
            procedure_id=proc.procedure_id if proc else None,
            performed_by=performed_by,
            due_date=due_date,
        )
        # 절차서 단계에 맞춘 체크리스트 초기화
        if proc:
            for step in proc.steps:
                log.step_checks.append(MaintenanceStepCheck(
                    maintenance_log_id=log.log_id,
                    step_id=step.step_id,
                    step_title=step.step_title,
                ))
        self._log_store[log.log_id] = log
        return log

    def check_step(self, log_id: str, step_id: str,
                   memo: str | None = None) -> MaintenanceLogDetail:
        log = self._log_store.get(log_id)
        if not log:
            raise ValueError(f"정비 로그를 찾을 수 없습니다: {log_id}")
        log.check_step(step_id, memo)
        return log

    def submit_log(self, log_id: str,
                   payload: MaintenanceLogSubmitDTO) -> MaintenanceLogDetail:
        """정비 완료 제출 — 필수 단계 체크 확인 후 저장"""
        log = self._log_store.get(log_id)
        if not log:
            raise ValueError(f"정비 로그를 찾을 수 없습니다: {log_id}")

        # 필수 단계 미완료 확인
        if log.procedure_id:
            proc = next(
                (p for p in self._store.values()
                 if p.procedure_id == log.procedure_id), None
            )
            if proc:
                unchecked = log.get_unchecked_mandatory(proc)
                if unchecked:
                    titles = ", ".join(s.step_title for s in unchecked)
                    raise UncompletedStepsError(
                        f"필수 점검 항목 {len(unchecked)}개가 미완료입니다: {titles}"
                    )

        # 정비 내용 저장
        from datetime import datetime
        log.work_summary    = payload.work_summary
        log.work_detail     = payload.work_detail
        log.parts_replaced  = payload.parts_replaced or []
        log.issues_found    = payload.issues_found
        log.next_check_notes= payload.next_check_notes
        log.actual_minutes  = payload.actual_minutes
        log.photo_urls      = payload.photo_urls or []
        log.status          = "COMPLETED"
        log.completed_at    = datetime.now()

        logger.info(f"[Maintenance] 정비 완료: {log.log_id[:8]}, "
                    f"소요={payload.actual_minutes}분")
        return log

    def get_history(self, task_id: str) -> list[MaintenanceLogDetail]:
        return [l for l in self._log_store.values() if l.task_id == task_id]

    def add_procedure(self, procedure: MaintenanceProcedure) -> None:
        self._store[procedure.equipment_type] = procedure

    def update_step(self, equipment_type: str, step_no: int,
                    description: str | None = None,
                    photo_guide_url: str | None = None) -> bool:
        """단계 설명·사진 나중에 추가"""
        proc = self._store.get(equipment_type)
        if not proc:
            return False
        for step in proc.steps:
            if step.step_no == step_no:
                if description is not None:
                    step.step_description = description
                if photo_guide_url is not None:
                    step.photo_guide_url = photo_guide_url
                proc.updated_at = __import__('datetime').datetime.now()
                return True
        return False
