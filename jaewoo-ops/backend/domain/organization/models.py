"""
Organization Context — 조직/인원 도메인 모델
"""
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from uuid import uuid4


class Role(str, Enum):
    STAFF = "STAFF"
    TEAM_LEAD = "TEAM_LEAD"
    MANAGER = "MANAGER"
    ADMIN = "ADMIN"


class Language(str, Enum):
    KO = "KO"
    EN = "EN"
    VN = "VN"
    TH = "TH"
    ZH = "ZH"
    ID = "ID"


class AbsenceType(str, Enum):
    ANNUAL = "ANNUAL"
    SICK = "SICK"
    OTHER = "OTHER"


@dataclass
class AbsenceSchedule:
    absence_id: str = field(default_factory=lambda: str(uuid4()))
    employee_id: str = ""
    start_date: date = field(default_factory=date.today)
    end_date: date = field(default_factory=date.today)
    absence_type: AbsenceType = AbsenceType.ANNUAL
    registered_at: datetime = field(default_factory=datetime.now)

    def is_active_on(self, target: date) -> bool:
        return self.start_date <= target <= self.end_date


@dataclass
class Employee:
    """Employee Aggregate Root"""
    employee_id: str = field(default_factory=lambda: str(uuid4()))
    name: str = ""
    email: str = ""
    phone: str = ""
    kakaowork_id: str | None = None
    preferred_channel: str = "KAKAO_ALIMTALK"
    team_id: str = ""
    role: Role = Role.STAFF
    language: Language = Language.KO
    is_active: bool = True
    backup_employee_id: str | None = None
    deputy_employee_id: str | None = None
    absence_schedules: list[AbsenceSchedule] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    def is_absent_on(self, target: date) -> bool:
        return any(a.is_active_on(target) for a in self.absence_schedules)

    def add_absence(self, start_date: date, end_date: date,
                    absence_type: AbsenceType = AbsenceType.ANNUAL) -> AbsenceSchedule:
        if end_date < start_date:
            raise ValueError("종료일이 시작일보다 빠를 수 없습니다.")
        absence = AbsenceSchedule(
            employee_id=self.employee_id,
            start_date=start_date,
            end_date=end_date,
            absence_type=absence_type,
        )
        self.absence_schedules.append(absence)
        return absence


@dataclass
class Team:
    """Team Entity"""
    team_id: str = field(default_factory=lambda: str(uuid4()))
    name: str = ""
    leader_id: str = ""
    manager_channel_id: str = ""
    kakaowork_group_conv_id: str | None = None   # 팀 단톡방 ID
    kakaowork_manager_conv_id: str | None = None  # 관리자 단톡방 ID
    members: list[str] = field(default_factory=list)  # EmployeeId[]
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
