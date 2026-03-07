"""
iCalendar 생성기 — .ics / Webcal 표준 방식
삼성·애플·구글·아웃룩 캘린더 모두 지원 (OAuth 불필요)
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def _try_import_icalendar():
    try:
        from icalendar import Alarm, Calendar, Event
        return Calendar, Event, Alarm
    except ImportError:
        return None, None, None


def build_ics_feed(tasks: list, employee_name: str) -> bytes:
    """
    직원의 전체 미완료 업무를 iCalendar 피드(.ics)로 생성.
    icalendar 패키지 미설치 시 기본 텍스트 포맷으로 대체.
    """
    Calendar, Event, Alarm = _try_import_icalendar()

    if Calendar:
        return _build_with_icalendar(tasks, employee_name, Calendar, Event, Alarm)
    else:
        return _build_raw_ics(tasks, employee_name)


def build_single_event_ics(task: dict) -> bytes:
    """단건 업무 .ics 파일 생성 (알림톡 [캘린더에 추가] 버튼용)"""
    Calendar, Event, Alarm = _try_import_icalendar()

    if Calendar:
        cal = Calendar()
        cal.add("prodid", "-//재우 운영관리 시스템//KR")
        cal.add("version", "2.0")
        cal.add_component(_build_vevent(task, Event, Alarm))
        return cal.to_ical()
    else:
        lines = _ics_header("-//재우 운영관리 시스템//KR")
        lines += _raw_vevent(task)
        lines += "END:VCALENDAR\r\n"
        return lines.encode("utf-8")


def _build_with_icalendar(tasks, employee_name, Calendar, Event, Alarm) -> bytes:
    cal = Calendar()
    cal.add("prodid",  "-//재우 운영관리 시스템//KR")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method",  "PUBLISH")
    cal.add("x-wr-calname",  f"재우 OPS — {employee_name}")
    cal.add("x-wr-timezone", "Asia/Seoul")
    cal.add("x-wr-caldesc",  "재우 운영관리 시스템 업무 일정")

    for task in tasks:
        cal.add_component(_build_vevent(task, Event, Alarm))

    return cal.to_ical()


def _build_vevent(task: dict, Event, Alarm):
    """Task dict → VEVENT"""
    event = Event()
    task_id  = task.get("task_id", "")
    due_date = task.get("due_date")  # date or datetime

    event.add("uid",     f"task-{task_id}@jaewoo-ops.com")
    event.add("summary", task.get("title", "업무"))

    if due_date:
        if hasattr(due_date, "hour"):
            dt_start = due_date.replace(tzinfo=KST)
        else:
            from datetime import datetime as dt
            dt_start = dt(due_date.year, due_date.month, due_date.day,
                          9, 0, tzinfo=KST)
        event.add("dtstart", dt_start)
        event.add("dtend",   dt_start + timedelta(hours=1))

    desc_lines = [
        f"업무 유형: {task.get('task_type', '')}",
        f"담당자: {task.get('assignee_name', '')}",
        f"우선순위: {task.get('priority', '')}",
        f"설명: {task.get('description', '-')}",
        "",
        f"완료 처리: {task.get('completion_url', '')}",
    ]
    event.add("description", "\n".join(desc_lines))
    event.add("location",    task.get("location", "재우(주) 농장"))
    event.add("status",      "CONFIRMED")

    priority_map = {"EMERGENCY": 1, "CRITICAL": 1, "HIGH": 3, "MEDIUM": 5, "LOW": 7}
    event.add("priority", priority_map.get(task.get("priority", "MEDIUM"), 5))

    # VALARM — 마감 1일 전 오전 9시 알림
    alarm = Alarm()
    alarm.add("action",      "DISPLAY")
    alarm.add("description", f"[재우 OPS] {task.get('title', '업무')} 마감 D-1")
    alarm.add("trigger",     timedelta(days=-1))
    event.add_component(alarm)

    return event


def _build_raw_ics(tasks, employee_name: str) -> bytes:
    """icalendar 미설치 시 순수 텍스트 ICS 생성"""
    lines = _ics_header(f"-//재우 운영관리 시스템//KR")
    lines += f"X-WR-CALNAME:재우 OPS — {employee_name}\r\n"
    for task in tasks:
        lines += _raw_vevent(task)
    lines += "END:VCALENDAR\r\n"
    return lines.encode("utf-8")


def _ics_header(prodid: str) -> str:
    return (
        "BEGIN:VCALENDAR\r\n"
        f"PRODID:{prodid}\r\n"
        "VERSION:2.0\r\n"
        "CALSCALE:GREGORIAN\r\n"
        "METHOD:PUBLISH\r\n"
        "X-WR-TIMEZONE:Asia/Seoul\r\n"
    )


def _raw_vevent(task: dict) -> str:
    task_id  = task.get("task_id", "unknown")
    due_date = task.get("due_date")
    now_str  = datetime.now(KST).strftime("%Y%m%dT%H%M%S")

    dtstart = ""
    dtend   = ""
    if due_date:
        if hasattr(due_date, "strftime"):
            dtstart = due_date.strftime("%Y%m%d") + "T090000"
            dtend   = due_date.strftime("%Y%m%d") + "T100000"

    return (
        "BEGIN:VEVENT\r\n"
        f"UID:task-{task_id}@jaewoo-ops.com\r\n"
        f"SUMMARY:{task.get('title','업무')}\r\n"
        f"DTSTART;TZID=Asia/Seoul:{dtstart}\r\n"
        f"DTEND;TZID=Asia/Seoul:{dtend}\r\n"
        f"DESCRIPTION:{task.get('description','')}\r\n"
        f"STATUS:CONFIRMED\r\n"
        f"DTSTAMP:{now_str}Z\r\n"
        "END:VEVENT\r\n"
    )


# ── 캘린더 구독 토큰 관리 ────────────────────────────────────────────

class CalendarSubscriptionStore:
    """Phase 1: 인메모리 구독 토큰 저장소 (Phase 2: DB calendar_subscriptions 테이블)"""

    def __init__(self):
        self._by_token: dict[str, dict] = {}
        self._by_employee: dict[str, str] = {}  # employee_id → token

    def create_or_get(self, employee_id: str, employee_name: str,
                       base_url: str) -> dict:
        """직원 등록 시 토큰 자동 발급 (이미 있으면 기존 반환)"""
        if employee_id in self._by_employee:
            token = self._by_employee[employee_id]
            return self._by_token[token]

        token = secrets.token_urlsafe(48)  # 64자 수준
        feed_url = f"webcal://{base_url.replace('http://','').replace('https://','')}/calendar/{token}/feed.ics"
        sub = {
            "employee_id":   employee_id,
            "employee_name": employee_name,
            "unique_token":  token,
            "feed_url":      feed_url,
            "is_active":     True,
            "created_at":    datetime.now(KST).isoformat(),
        }
        self._by_token[token]       = sub
        self._by_employee[employee_id] = token
        return sub

    def get_by_token(self, token: str) -> dict | None:
        return self._by_token.get(token)

    def revoke(self, employee_id: str) -> None:
        token = self._by_employee.pop(employee_id, None)
        if token and token in self._by_token:
            self._by_token[token]["is_active"] = False
