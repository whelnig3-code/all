"""
재배 리포트 생성기 - PyInstaller 실행 엔트리포인트.

동작 순서:
  1. 사용 가능한 포트 자동 탐색 (기본 7862)
  2. 백그라운드 스레드에서 uvicorn 서버 시작
  3. 서버가 준비되면 기본 브라우저로 http://localhost:<port> 오픈
  4. 콘솔 창 없이 트레이 아이콘 방식으로 동작 (Ctrl+C 또는 창 닫기로 종료)

PyInstaller 패키징 시 이 파일이 엔트리포인트가 됨:
  pyinstaller sunamri.spec
"""

from __future__ import annotations

import multiprocessing
import os
import socket
import sys
import threading
import time
import webbrowser

# ── PyInstaller 필수: 멀티프로세싱 freeze_support ─────────────
# Windows에서 multiprocessing 사용 시 반드시 필요
if __name__ == "__main__":
    multiprocessing.freeze_support()

# ── sys.path: backend/ 디렉터리를 Python 경로에 추가 ──────────
if getattr(sys, "frozen", False):
    # 패키징 모드: exe 파일이 있는 디렉터리
    _ROOT = sys._MEIPASS
else:
    # 개발 모드: launcher.py 가 있는 backend/ 디렉터리
    _ROOT = os.path.dirname(os.path.abspath(__file__))

if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

DEFAULT_PORT = 7862
APP_NAME = "재배 리포트 생성기"


# ── 포트 탐색 ─────────────────────────────────────────────────

def _find_free_port(preferred: int = DEFAULT_PORT) -> int:
    """선호 포트가 사용 중이면 OS가 배정하는 빈 포트를 반환한다."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            pass  # 사용 중 → 다른 포트 배정

    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


# ── 서버 준비 대기 ────────────────────────────────────────────

def _wait_for_server(host: str, port: int, timeout: float = 15.0) -> bool:
    """uvicorn이 준비될 때까지 최대 timeout초 대기한다."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.2)
    return False


# ── 브라우저 오픈 ─────────────────────────────────────────────

def _open_browser(url: str) -> None:
    """서버 준비 후 기본 브라우저를 연다."""
    host, port = url.replace("http://", "").split(":")
    if _wait_for_server(host, int(port)):
        webbrowser.open(url)
    else:
        print(f"[경고] 서버가 {url} 에서 응답하지 않습니다.")


# ── uvicorn 실행 ──────────────────────────────────────────────

def _run_server(port: int) -> None:
    """uvicorn 서버를 현재 스레드에서 실행한다 (블로킹)."""
    import uvicorn

    uvicorn.run(
        "interfaces.api.main:app",
        host="127.0.0.1",
        port=port,
        log_level="warning",
        # PyInstaller 환경에서 reload 금지
        reload=False,
    )


# ── 메인 ──────────────────────────────────────────────────────

def main() -> None:
    port = _find_free_port()
    url = f"http://localhost:{port}"

    print(f"═══════════════════════════════════════")
    print(f"  {APP_NAME}")
    print(f"  주소: {url}")
    print(f"  종료: 이 창을 닫거나 Ctrl+C")
    print(f"═══════════════════════════════════════")

    # 브라우저 오픈: 서버 준비 확인 후 자동 오픈 (별도 스레드)
    threading.Thread(
        target=_open_browser,
        args=(url,),
        daemon=True,
    ).start()

    # uvicorn 서버 실행 (메인 스레드 블로킹)
    try:
        _run_server(port)
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")


if __name__ == "__main__":
    main()
