"""v4.4.x: 운영 감사(Audit) 로그 체계.

3개 로그 파일을 JSON Lines 형식으로 관리:
  - system.log  : DB 마이그레이션, 리셋 이벤트, 기준선 저장, 예외
  - data.log    : 파일 임포트 시 데이터 품질 기록
  - decision.log: 분석 판정 의사결정 추적

RotatingFileHandler: maxBytes=5MB, backupCount=5
중복 핸들러 방지 처리 포함.
"""
import json
import logging
from datetime import datetime
from logging.handlers import RotatingFileHandler

from src.paths import LOG_DIR

# 디렉토리 보장
LOG_DIR.mkdir(parents=True, exist_ok=True)

_MAX_BYTES = 5_000_000
_BACKUP_COUNT = 5


class _JsonFormatter(logging.Formatter):
    """로그 레코드를 JSON 한 줄로 포맷."""

    def format(self, record: logging.LogRecord) -> str:
        # record.msg가 dict이면 그대로 직렬화, 아니면 감싸기
        if isinstance(record.msg, dict):
            payload = record.msg
        else:
            payload = {"message": str(record.msg)}
        # 항상 timestamp 보장
        if "timestamp" not in payload:
            payload["timestamp"] = datetime.now().isoformat()
        return json.dumps(payload, ensure_ascii=False, default=str)


def get_logger(name: str, filename: str) -> logging.Logger:
    """이름과 파일명으로 JSON Lines 로거를 생성/반환.

    중복 핸들러를 방지하여 같은 이름으로 여러 번 호출해도 안전.
    """
    log = logging.getLogger(name)

    # 이미 핸들러가 있으면 추가하지 않음
    if log.handlers:
        return log

    log.setLevel(logging.INFO)
    log.propagate = False

    handler = RotatingFileHandler(
        str(LOG_DIR / filename),
        maxBytes=_MAX_BYTES,
        backupCount=_BACKUP_COUNT,
        encoding="utf-8",
    )
    handler.setFormatter(_JsonFormatter())
    log.addHandler(handler)
    return log


# ── 미리 생성된 로거 인스턴스 ─────────────────────────────────
system_logger = get_logger("audit.system", "system.log")
data_logger = get_logger("audit.data", "data.log")
decision_logger = get_logger("audit.decision", "decision.log")
