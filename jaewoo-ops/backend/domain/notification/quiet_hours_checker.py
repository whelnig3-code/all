"""
야간 조용한 시간대 알림 차단 — QuietHoursChecker
기본: 22:00 ~ 07:00 발송 억제 (CRITICAL/EMERGENCY는 즉시 발송)
"""
from datetime import datetime, time
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")

# 조용한 시간 기본값
_DEFAULT_QUIET_START = time(22, 0)  # 22:00
_DEFAULT_QUIET_END   = time(7, 0)   # 07:00


class QuietHoursChecker:
    """
    알림 발송 가능 시간대 확인.

    설계 §17: 야간(22시~익일 07시) 구간은 일반 알림 억제.
    CRITICAL / EMERGENCY 우선순위는 예외 처리하여 즉시 발송.
    """

    def __init__(
        self,
        quiet_start: time = _DEFAULT_QUIET_START,
        quiet_end: time   = _DEFAULT_QUIET_END,
        tz: ZoneInfo      = KST,
    ):
        self.quiet_start = quiet_start
        self.quiet_end   = quiet_end
        self.tz          = tz

    def is_quiet_now(self) -> bool:
        """현재 시각이 조용한 시간대인지 반환"""
        now = datetime.now(self.tz).time().replace(second=0, microsecond=0)
        return self._in_quiet_window(now)

    def _in_quiet_window(self, t: time) -> bool:
        # 22:00 ~ 23:59 또는 00:00 ~ 06:59
        if self.quiet_start > self.quiet_end:          # 자정을 넘는 구간
            return t >= self.quiet_start or t < self.quiet_end
        return self.quiet_start <= t < self.quiet_end  # 같은 날 구간

    def should_suppress(self, priority: str) -> bool:
        """
        발송 억제 여부.
        CRITICAL / EMERGENCY 는 조용한 시간이어도 False(발송) 반환.
        """
        if priority.upper() in ("CRITICAL", "EMERGENCY"):
            return False
        return self.is_quiet_now()

    def next_send_time(self) -> datetime:
        """
        억제 중일 때 다음 발송 가능 시각 반환.
        억제 중이 아니면 현재 시각 반환.
        """
        now = datetime.now(self.tz)
        if not self.is_quiet_now():
            return now

        # quiet_end 시각(당일 또는 익일)을 계산
        candidate = now.replace(
            hour=self.quiet_end.hour,
            minute=self.quiet_end.minute,
            second=0,
            microsecond=0,
        )
        if candidate <= now:
            from datetime import timedelta
            candidate += timedelta(days=1)
        return candidate
