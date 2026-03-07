"""지하수 펌프 유량 분석 시스템 – 엔트리 포인트."""
import sys
import os
import logging

# ── High-DPI 지원 (QApplication 생성 전 필수) ──────────────
os.environ.setdefault("QT_ENABLE_HIGHDPI_SCALING", "1")
os.environ.setdefault("QT_SCALE_FACTOR_ROUNDING_POLICY", "PassThrough")

# 프로젝트 루트를 sys.path에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.paths import LOG_PATH
from src.config import load_settings
from src.database import init_db
from src.styles import APP_TITLE, get_light_stylesheet, get_dark_stylesheet
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_PATH), encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


def main():
    logger.info("=== 프로그램 시작 ===")
    init_db()

    from PySide6.QtWidgets import QApplication
    from PySide6.QtGui import QFont
    from PySide6.QtCore import Qt
    from src.gui import MainWindow

    # High-DPI: PySide6 방식
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)

    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    f = QFont("맑은 고딕", 12)
    app.setFont(f)

    # 스타일시트 적용
    settings = load_settings()
    if settings.get("dark_mode", False):
        app.setStyleSheet(get_dark_stylesheet())
    else:
        app.setStyleSheet(get_light_stylesheet())

    window = MainWindow()
    window.show()

    # 설정 탭 초기 로드
    window.tab_settings.refresh()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
