"""
안평리 숙주 재배 리포트 생성기 v6.0 - 엔트리포인트.

이 파일을 실행하거나 PyInstaller로 빌드하여 단일 exe를 생성한다.
싱글 인스턴스를 보장한다 (파일 잠금 방식).
"""

import sys
import os
import warnings

# PyInstaller 번들 경로 보정
if getattr(sys, "frozen", False):
    # exe로 실행 중
    base_path = sys._MEIPASS
else:
    # 개발 환경: 프로젝트 루트를 sys.path에 추가
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if base_path not in sys.path:
    sys.path.insert(0, base_path)

# 경고 숨김
warnings.filterwarnings("ignore")


# ─── 싱글 인스턴스 보장 ────────────────────────────────

_lock_file = None
_lock_handle = None


def _acquire_lock():
    """
    파일 잠금으로 싱글 인스턴스를 보장한다.
    이미 실행 중이면 False를 반환한다.
    """
    global _lock_file, _lock_handle

    lock_dir = os.path.join(os.path.expanduser("~"), "Desktop", "재배리포트", "안평리")
    os.makedirs(lock_dir, exist_ok=True)
    _lock_file = os.path.join(lock_dir, ".app.lock")

    try:
        _lock_handle = open(_lock_file, "w", encoding="utf-8")
        if sys.platform == "win32":
            import msvcrt
            msvcrt.locking(_lock_handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(_lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_handle.write(str(os.getpid()))
        _lock_handle.flush()
        return True
    except (IOError, OSError):
        # 이미 다른 인스턴스가 잠금 중
        if _lock_handle:
            _lock_handle.close()
            _lock_handle = None
        return False


def _release_lock():
    """파일 잠금을 해제한다."""
    global _lock_handle
    if _lock_handle:
        try:
            _lock_handle.close()
        except Exception:
            pass
        _lock_handle = None


def main():
    """애플리케이션을 시작한다."""
    if not _acquire_lock():
        # 이미 실행 중 → 경고 후 종료
        try:
            from tkinter import messagebox
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            messagebox.showwarning(
                "알림",
                "프로그램이 이미 실행 중입니다.\n"
                "작업 표시줄에서 기존 창을 확인하세요.",
            )
            root.destroy()
        except Exception:
            pass
        return

    try:
        from engine.logger import setup_logging
        setup_logging()

        from app.gui import ReportGeneratorApp

        app = ReportGeneratorApp()
        app.mainloop()
    finally:
        _release_lock()


if __name__ == "__main__":
    main()
