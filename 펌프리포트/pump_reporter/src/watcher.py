"""input 폴더 감시 – 신규/수정 .xls/.xlsx 파일 자동 분석."""
import logging
import time
from pathlib import Path
from threading import Thread
from typing import Callable

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

from src.config import INPUT_DIR

logger = logging.getLogger(__name__)

WATCH_EXTENSIONS = {".xls", ".xlsx", ".html", ".htm"}


class InputFileHandler(FileSystemEventHandler):
    def __init__(self, callback: Callable[[Path], None]):
        super().__init__()
        self.callback = callback
        self._processed = set()

    def on_created(self, event: FileSystemEvent):
        self._handle(event)

    def on_modified(self, event: FileSystemEvent):
        self._handle(event)

    def _handle(self, event: FileSystemEvent):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix.lower() not in WATCH_EXTENSIONS:
            return

        # 중복 처리 방지 (같은 파일 연속 이벤트)
        key = (str(path), path.stat().st_mtime if path.exists() else 0)
        if key in self._processed:
            return
        self._processed.add(key)
        # 오래된 기록 정리
        if len(self._processed) > 1000:
            self._processed.clear()

        # 파일 쓰기 완료 대기
        time.sleep(1)
        logger.info(f"새 파일 감지: {path.name}")
        try:
            self.callback(path)
        except Exception as e:
            logger.error(f"파일 처리 실패: {path.name} - {e}")


class FolderWatcher:
    def __init__(self, callback: Callable[[Path], None],
                 watch_dir: Path = None):
        self.watch_dir = watch_dir or INPUT_DIR
        self.watch_dir.mkdir(parents=True, exist_ok=True)
        self.callback = callback
        self.observer = None
        self._thread = None
        self._running = False

    def start(self):
        if self._running:
            return
        self._running = True
        self.observer = Observer()
        handler = InputFileHandler(self.callback)
        self.observer.schedule(handler, str(self.watch_dir), recursive=False)
        self.observer.start()
        logger.info(f"폴더 감시 시작: {self.watch_dir}")

    def stop(self):
        self._running = False
        if self.observer:
            self.observer.stop()
            self.observer.join(timeout=5)
            self.observer = None
        logger.info("폴더 감시 중지")

    @property
    def is_running(self) -> bool:
        return self._running
