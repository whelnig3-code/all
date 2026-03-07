"""
긴급신고 챗봇 — 도메인 모델
"""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import uuid4


class IssueType(str, Enum):
    CROP_ABNORMAL   = "CROP_ABNORMAL"    # 나물 이상
    MACHINE_FAILURE = "MACHINE_FAILURE"  # 기계 고장
    WATER_ISSUE     = "WATER_ISSUE"      # 물/양액 이상
    TEMPERATURE     = "TEMPERATURE"      # 온도 이상
    ELECTRICAL      = "ELECTRICAL"       # 전기 이상
    HELP_OTHER      = "HELP_OTHER"       # 기타/도움 요청


class ReportStatus(str, Enum):
    SUBMITTED    = "SUBMITTED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    DISPATCHED   = "DISPATCHED"
    RESOLVED     = "RESOLVED"


ISSUE_TYPE_KO = {
    IssueType.CROP_ABNORMAL:   "나물 이상",
    IssueType.MACHINE_FAILURE: "기계 고장",
    IssueType.WATER_ISSUE:     "물/양액 이상",
    IssueType.TEMPERATURE:     "온도 이상",
    IssueType.ELECTRICAL:      "전기 이상",
    IssueType.HELP_OTHER:      "기타/도움 요청",
}


@dataclass
class EmergencyReportPhoto:
    photo_id: str = field(default_factory=lambda: str(uuid4()))
    report_id: str = ""
    kakao_image_url: str = ""
    uploaded_at: datetime = field(default_factory=datetime.now)


@dataclass
class EmergencyReport:
    """긴급신고 Aggregate"""
    report_id: str = field(default_factory=lambda: str(uuid4()))
    reporter_id: str | None = None
    kakao_user_key: str = ""
    reporter_lang: str = "VN"
    issue_type: IssueType = IssueType.HELP_OTHER
    location_zone: str | None = None
    description_raw: str | None = None     # 원문 (신고자 언어)
    description_ko: str | None = None      # 자동 번역 (한국어)
    status: ReportStatus = ReportStatus.SUBMITTED
    assigned_to: str | None = None
    linked_task_id: str | None = None
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    submitted_at: datetime = field(default_factory=datetime.now)
    photos: list[EmergencyReportPhoto] = field(default_factory=list)

    def acknowledge(self, employee_id: str) -> None:
        self.status = ReportStatus.ACKNOWLEDGED
        self.assigned_to = employee_id
        self.acknowledged_at = datetime.now()

    def resolve(self) -> None:
        self.status = ReportStatus.RESOLVED
        self.resolved_at = datetime.now()
