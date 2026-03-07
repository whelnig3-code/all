"""
로그 파일 관리 모듈.

Desktop\\재배리포트\\안평리\\{YYYY}\\{MM}\\logs\\YYYYMMDD.log 경로에
날짜별 로그를 기록한다.

또한 Teams 업로드 실패 기록을 pending_uploads.json으로 관리하여,
다음 실행 시 재업로드를 시도할 수 있도록 한다.

사용법
------
    from engine.logger import setup_logging
    setup_logging()  # 앱 시작 시 1회 호출

이후 각 모듈에서:
    import logging
    logger = logging.getLogger("anpyeong")
    logger.info("메시지")
"""

import json
import logging
import os
import tempfile
from datetime import datetime


logger = logging.getLogger("anpyeong")

_initialized = False


def setup_logging(output_dir=None):
    """
    로깅 시스템을 초기화한다.

    Parameters
    ----------
    output_dir : str, optional
        기본 출력 디렉토리. None이면 Desktop\\안평리_리포트

    Returns
    -------
    str
        로그 파일 경로
    """
    global _initialized
    if _initialized:
        return _get_log_path(output_dir)

    log_path = _get_log_path(output_dir)
    log_dir = os.path.dirname(log_path)
    os.makedirs(log_dir, exist_ok=True)

    logger.setLevel(logging.DEBUG)

    # 기존 핸들러 제거 (중복 방지)
    logger.handlers.clear()

    # 파일 핸들러: DEBUG 이상 모든 로그
    file_handler = logging.FileHandler(log_path, encoding="utf-8", mode="a")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(file_handler)

    logger.info("=" * 60)
    logger.info("안평리 숙주 재배 리포트 생성기 v6.0 시작")
    logger.info(f"로그 파일: {log_path}")
    logger.info("=" * 60)

    _initialized = True
    return log_path


def _get_log_path(output_dir=None):
    """로그 파일 경로를 반환한다."""
    if output_dir is None:
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        output_dir = os.path.join(desktop, "재배리포트")
    log_dir = os.path.join(output_dir, "logs")
    today = datetime.now().strftime("%Y%m%d")
    return os.path.join(log_dir, f"{today}.log")


def _get_output_dir():
    """기본 출력 디렉토리를 반환한다."""
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    return os.path.join(desktop, "재배리포트")


def _pending_path(output_dir=None):
    """실패 업로드 메타 파일 경로를 반환한다."""
    if output_dir is None:
        output_dir = _get_output_dir()
    return os.path.join(output_dir, "logs", "pending_uploads.json")


# ─── 실패 업로드 기록 관리 ─────────────────────────────

def save_failed_upload(file_path, error_msg, output_dir=None):
    """
    업로드 실패 파일을 기록한다.

    Parameters
    ----------
    file_path : str
        업로드 실패한 로컬 파일 경로
    error_msg : str
        실패 사유
    output_dir : str, optional
        출력 디렉토리
    """
    meta_path = _pending_path(output_dir)
    os.makedirs(os.path.dirname(meta_path), exist_ok=True)

    pending = load_failed_uploads(output_dir)

    # 중복 방지 (같은 파일 경로는 덮어쓰기)
    pending = [p for p in pending if p["file_path"] != file_path]
    pending.append({
        "file_path": file_path,
        "error": error_msg,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })

    _atomic_json_write(meta_path, pending)

    logger.info(f"업로드 실패 기록 저장: {os.path.basename(file_path)}")


def load_failed_uploads(output_dir=None):
    """
    미완료 업로드 목록을 로드한다.

    Returns
    -------
    list[dict]
        각 항목: {"file_path": str, "error": str, "timestamp": str}
    """
    meta_path = _pending_path(output_dir)
    if not os.path.exists(meta_path):
        return []
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # 파일이 실제로 존재하는 항목만 반환
        return [p for p in data if os.path.isfile(p.get("file_path", ""))]
    except (json.JSONDecodeError, KeyError, TypeError):
        return []


def clear_failed_upload(file_path, output_dir=None):
    """
    특정 파일의 실패 기록을 삭제한다.

    Parameters
    ----------
    file_path : str
        성공적으로 업로드된 파일 경로
    """
    meta_path = _pending_path(output_dir)
    pending = load_failed_uploads(output_dir)
    pending = [p for p in pending if p["file_path"] != file_path]

    if pending:
        _atomic_json_write(meta_path, pending)
    elif os.path.exists(meta_path):
        os.remove(meta_path)

    logger.info(f"업로드 실패 기록 삭제: {os.path.basename(file_path)}")


def clear_all_failed_uploads(output_dir=None):
    """모든 실패 기록을 삭제한다."""
    meta_path = _pending_path(output_dir)
    if os.path.exists(meta_path):
        os.remove(meta_path)


# ─── 내부 유틸리티 ─────────────────────────────────────

def _atomic_json_write(file_path, data):
    """
    JSON 파일을 원자적으로 쓴다.
    임시 파일에 먼저 기록한 후 os.replace로 교체한다.
    쓰기 중 프로그램 종료 시에도 원본이 손상되지 않는다.
    """
    dir_path = os.path.dirname(file_path)
    fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, file_path)
    except Exception:
        # 임시 파일 정리
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise
