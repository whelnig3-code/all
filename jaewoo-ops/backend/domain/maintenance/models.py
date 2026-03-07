"""
정비일지 고도화 — 설비별 표준 절차서(SOP) 도메인 모델
"""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import uuid4


class Difficulty(str, Enum):
    BEGINNER     = "BEGINNER"      # 초보자 가능
    INTERMEDIATE = "INTERMEDIATE"  # 중급자
    EXPERT       = "EXPERT"        # 전문가 필요


DIFFICULTY_LABEL = {
    Difficulty.BEGINNER:     "초보자 가능",
    Difficulty.INTERMEDIATE: "중급자",
    Difficulty.EXPERT:       "전문가 필요",
}


@dataclass
class MaintenanceProcedureStep:
    """절차서 단계 항목"""
    step_id: str = field(default_factory=lambda: str(uuid4()))
    procedure_id: str = ""
    step_no: int = 1
    step_title: str = ""
    step_description: str | None = None
    photo_guide_url: str | None = None
    is_mandatory: bool = True
    warning_note: str | None = None


@dataclass
class MaintenanceProcedure:
    """설비별 표준 정비 절차서 (SOP)"""
    procedure_id: str = field(default_factory=lambda: str(uuid4()))
    equipment_type: str = ""           # 예: "양액탱크펌프"
    procedure_name: str = ""           # 예: "양액펌프 월간 정기점검"
    version: str = "1.0"
    difficulty: Difficulty = Difficulty.BEGINNER
    estimated_min: int | None = None   # 예상 소요 시간(분)
    tools_required: list[str] = field(default_factory=list)
    safety_warnings: list[str] = field(default_factory=list)
    steps: list[MaintenanceProcedureStep] = field(default_factory=list)
    is_active: bool = True
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    @property
    def difficulty_label(self) -> str:
        return DIFFICULTY_LABEL.get(self.difficulty, self.difficulty.value)

    @property
    def mandatory_steps(self) -> list[MaintenanceProcedureStep]:
        return [s for s in self.steps if s.is_mandatory]

    def add_step(self, title: str, description: str | None = None,
                 is_mandatory: bool = True,
                 warning: str | None = None) -> MaintenanceProcedureStep:
        step_no = max((s.step_no for s in self.steps), default=0) + 1
        step = MaintenanceProcedureStep(
            procedure_id=self.procedure_id,
            step_no=step_no,
            step_title=title,
            step_description=description,
            is_mandatory=is_mandatory,
            warning_note=warning,
        )
        self.steps.append(step)
        return step


@dataclass
class MaintenanceStepCheck:
    """정비 수행 중 절차 단계 체크 현황"""
    check_id: str = field(default_factory=lambda: str(uuid4()))
    maintenance_log_id: str = ""
    step_id: str = ""
    step_title: str = ""
    is_checked: bool = False
    checked_at: datetime | None = None
    memo: str | None = None


@dataclass
class MaintenanceLogDetail:
    """정비 수행 기록 (고도화) — maintenance_logs 확장"""
    log_id: str = field(default_factory=lambda: str(uuid4()))
    task_id: str = ""
    procedure_id: str | None = None
    performed_by: str = ""
    due_date: str = ""
    status: str = "PENDING"
    work_summary: str | None = None
    work_detail: str | None = None
    parts_replaced: list[dict] = field(default_factory=list)  # [{"name": "O링", "qty": 2}]
    issues_found: str | None = None
    next_check_notes: str | None = None
    actual_minutes: int | None = None
    photo_urls: list[str] = field(default_factory=list)
    step_checks: list[MaintenanceStepCheck] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: datetime | None = None

    def check_step(self, step_id: str, memo: str | None = None) -> None:
        for check in self.step_checks:
            if check.step_id == step_id:
                check.is_checked = True
                check.checked_at = datetime.now()
                check.memo = memo
                return
        raise ValueError(f"단계를 찾을 수 없습니다: {step_id}")

    def get_unchecked_mandatory(self,
                                 procedure: MaintenanceProcedure) -> list[MaintenanceProcedureStep]:
        """미체크된 필수 단계 반환"""
        checked_ids = {c.step_id for c in self.step_checks if c.is_checked}
        return [s for s in procedure.mandatory_steps if s.step_id not in checked_ids]
