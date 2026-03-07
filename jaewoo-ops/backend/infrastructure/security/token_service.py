"""
완료 토큰 서비스 — JWT 생성/검증 (중 레벨: employee_id + PIN 4자리)
"""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from config import settings


def create_completion_token(task_id: str, employee_id: str) -> tuple[str, str]:
    """
    완료 토큰 생성.
    Returns: (signed_jwt_token, nonce)
    """
    nonce = generate_completion_nonce(task_id, employee_id)
    payload = {
        "task_id": task_id,
        "emp_id": employee_id,
        "nonce": nonce,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.completion_token_ttl_hours),
        "typ": "completion",
    }
    token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    return token, nonce


def verify_completion_token(token: str) -> dict:
    """
    완료 토큰 검증.
    Returns: {"task_id": ..., "emp_id": ..., "nonce": ...}
    Raises: ValueError on invalid/expired token
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError as e:
        raise ValueError(f"유효하지 않은 완료 토큰입니다: {e}")

    if payload.get("typ") != "completion":
        raise ValueError("토큰 유형이 올바르지 않습니다.")

    return payload


def generate_completion_nonce(task_id: str, employee_id: str) -> str:
    """중복 클릭 방지용 Nonce 생성"""
    raw = f"{task_id}:{employee_id}:{uuid.uuid4().hex}"
    return hashlib.sha256(raw.encode()).hexdigest()[:64]
