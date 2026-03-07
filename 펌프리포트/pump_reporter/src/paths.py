"""v4.5: 중앙 경로 관리 모듈.

실행 모드에 따라 데이터 경로를 분리:
  - frozen (PyInstaller exe): 운영 데이터 → exe 옆 (포터블 완본팩)
  - dev (python main.py):     운영 데이터 → 프로젝트 루트 (기존 호환)

번들 리소스(assets/ci.png 등)는 항상 설치 디렉토리에서 로드.
"""
import os
import sys
from pathlib import Path


# ── 설치 디렉토리 (exe 또는 프로젝트 루트) ────────────────────
def get_install_dir() -> Path:
    """PyInstaller exe 위치 또는 개발 모드 프로젝트 루트."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


# ── 번들 리소스 경로 ──────────────────────────────────────────
def resource_path(relative: str) -> Path:
    """번들 리소스 파일 경로 (assets/ci.png 등).

    frozen: _MEIPASS (onefile) 또는 exe 옆 (onedir)
    dev:    프로젝트 루트
    """
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    else:
        base = Path(__file__).resolve().parent.parent
    return base / relative


# ── 운영 데이터 디렉토리 ──────────────────────────────────────
def get_app_data_dir() -> Path:
    """운영 데이터 루트 디렉토리.

    frozen: exe 옆 (포터블 완본팩, 상대경로)
    dev:    프로젝트 루트
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent


# ── 경로 상수 (모듈 로드 시 결정) ────────────────────────────
INSTALL_DIR = get_install_dir()
APP_DATA_DIR = get_app_data_dir()

# 입력 데이터
INPUT_DIR = APP_DATA_DIR / "input"

# 출력
OUTPUT_DIR = APP_DATA_DIR / "output"
REPORTS_DIR = OUTPUT_DIR / "reports"
WEEKLY_DIR = REPORTS_DIR / "weekly"
MONTHLY_DIR = REPORTS_DIR / "monthly"
QUARTERLY_DIR = REPORTS_DIR / "quarterly"
YEARLY_DIR = REPORTS_DIR / "yearly"
CHARTS_DIR = OUTPUT_DIR / "charts"
CACHE_DIR = OUTPUT_DIR / "cache"

# 내부 데이터 (DB, 설정, 상태)
DATA_DIR = APP_DATA_DIR / "data"
DB_PATH = DATA_DIR / "pump_reporter.db"
SETTINGS_PATH = DATA_DIR / "settings.json"
PUMP_STATE_PATH = DATA_DIR / "pump_state.json"

# 로그
LOG_DIR = APP_DATA_DIR / "logs"
LOG_PATH = LOG_DIR / "app.log"

# 번들 리소스
LOGO_PATH = resource_path("assets/ci.png")

# 하위 호환: config.py에서 사용하던 BASE_DIR
BASE_DIR = APP_DATA_DIR


def ensure_dirs() -> None:
    """필요한 디렉토리를 모두 생성."""
    for d in [
        INPUT_DIR, REPORTS_DIR, WEEKLY_DIR, MONTHLY_DIR,
        QUARTERLY_DIR, YEARLY_DIR, CHARTS_DIR, CACHE_DIR,
        DATA_DIR, LOG_DIR,
    ]:
        d.mkdir(parents=True, exist_ok=True)


# 모듈 로드 시 디렉토리 자동 생성
ensure_dirs()
