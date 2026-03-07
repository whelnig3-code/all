"""PySide6 GUI – 메인 윈도우 + 5개 탭."""
import sys
import os
import subprocess
import logging
from pathlib import Path
from datetime import datetime

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QTabWidget, QWidget, QVBoxLayout,
    QHBoxLayout, QLabel, QPushButton, QFileDialog, QTableWidget,
    QTableWidgetItem, QHeaderView, QLineEdit, QSpinBox,
    QDoubleSpinBox, QCheckBox, QTextEdit, QMessageBox, QComboBox,
    QGroupBox, QFormLayout, QDateEdit, QProgressBar, QSplitter,
    QStatusBar, QScrollArea, QGridLayout, QFrame, QSizePolicy,
    QDialog, QDialogButtonBox, QRadioButton, QButtonGroup,
)
from PySide6.QtCore import Qt, QThread, Signal, QDate, QTimer
from PySide6.QtGui import QFont, QColor, QIcon, QPixmap

from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
import matplotlib.dates as mdates
import pandas as pd

from src.config import INPUT_DIR, REPORTS_DIR, LOGO_PATH, load_settings, save_settings
from src.database import (
    init_db, upsert_pump, get_all_pumps, delete_pump,
    add_casing_event, get_casing_history, delete_casing_event,
    get_analysis_results, get_data_date_range,
    get_pump_info, get_casing_history_recent,
    get_latest_results_per_pump, get_analysis_results_filtered,
    get_daily_averages, get_latest_baseline,
    get_latest_casing_with_baseline,
    get_baseline_profiles, save_baseline_profile,  # v4.0
    get_manual_baseline, save_manual_baseline, clear_manual_baseline,  # v4.6
)
from src.extractor import extract_from_file, save_extracted_data
from src.analyzer import (
    analyze_all_pumps, analyze_pump,
    classify_action_category, classify_action_with_reason,
    apply_stability_buffer, get_action_guidance_text,
    run_backtest_all,
)
from src.reporter import generate_report, generate_all_reports
from src.period import generate_report_plan, PERIOD_TYPE_KR
from src.watcher import FolderWatcher
from src.styles import (
    STATUS_COLORS, JUDGMENT_TO_STATUS, JUDGMENT_CARD_COLORS,
    APP_TITLE, FONT_FAMILY, ROLE_BADGE_COLORS, FONT_MONO,
)
from src.display_labels import (
    DISPLAY_LABELS, get_label, OPERATION_TYPE_KR, BASELINE_SOURCE_KR,
)

logger = logging.getLogger(__name__)


# ── Worker Threads ─────────────────────────────────────────
class AnalysisWorker(QThread):
    """파일 추출 + 전체 분석 + 리포트 생성."""
    finished = Signal(list)
    error = Signal(str)
    progress = Signal(str)

    def __init__(self, file_path: str = None):
        super().__init__()
        self.file_path = file_path

    def run(self):
        try:
            if self.file_path:
                self.progress.emit(f"파일 읽기: {Path(self.file_path).name}")
                data = extract_from_file(self.file_path)
                if not data:
                    self.error.emit("데이터를 추출할 수 없습니다.")
                    return
                self.progress.emit(f"데이터 저장: {len(data)}개 펌프")
                save_extracted_data(data)

            self.progress.emit("분석 실행 중...")
            results = analyze_all_pumps()

            self.progress.emit("전체 리포트 생성 중...")
            report_path, saved_ok = generate_report(results)

            for r in results:
                r["report_path"] = str(report_path)
                r["_report_saved_ok"] = saved_ok

            if saved_ok:
                self.progress.emit(f"완료! 리포트 저장: {report_path.name}")
            else:
                self.progress.emit("완료! (리포트 저장 실패)")
            self.finished.emit(results)
        except Exception as e:
            logger.exception("분석 오류")
            self.error.emit(str(e))


class ReportWorker(QThread):
    """기간별 리포트 일괄 생성 워커."""
    finished = Signal(list)  # list[dict]
    error = Signal(str)
    progress = Signal(str)

    def __init__(self, site: str, start_date: str, end_date: str):
        super().__init__()
        self.site = site
        self.start_date = start_date
        self.end_date = end_date

    def run(self):
        try:
            results = generate_all_reports(
                self.site, self.start_date, self.end_date,
                progress_callback=self.progress.emit)

            ok_count = sum(1 for r in results if r["saved_ok"])
            fail_count = len(results) - ok_count
            msg = f"완료! 리포트 {ok_count}개 생성"
            if fail_count:
                msg += f" ({fail_count}개 실패)"
            self.progress.emit(msg)
            self.finished.emit(results)
        except Exception as e:
            logger.exception("리포트 생성 오류")
            self.error.emit(str(e))


# ── 카드 지표 헬퍼 ──────────────────────────────────────────
def _add_metric(layout, label: str, value: str, color: str = "#333"):
    """카드 하단 지표 하나 (label + monospace value)."""
    container = QVBoxLayout()
    container.setSpacing(0)
    lbl = QLabel(label)
    lbl.setFont(QFont(FONT_FAMILY, 7))
    lbl.setStyleSheet("color: #888; border: none; background: transparent;")
    lbl.setAlignment(Qt.AlignCenter)
    container.addWidget(lbl)
    val = QLabel(value)
    val.setFont(QFont(FONT_MONO, 9))
    val.setStyleSheet(f"color: {color}; border: none; background: transparent;")
    val.setAlignment(Qt.AlignCenter)
    container.addWidget(val)
    layout.addLayout(container)


def _classify_action_category(result: dict, settings: dict = None) -> str:
    """v4.3: analyzer.classify_action_category() 위임."""
    return classify_action_category(result, settings)


# ── 대시보드 탭 ────────────────────────────────────────────
class DashboardTab(QWidget):
    """관리자 대시보드: ACTION 카드 + 2열 펌프 카드 + 3축 바 상세 패널."""

    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window
        self._selected_pump_id = None
        self._expert_mode = False
        self._results_cache = {}
        self._card_widgets = {}
        self._kpi_value_labels = {}
        self._bar_degradation = None
        self._bar_on_time = None
        self._bar_repeat = None
        self._detail_metrics_labels = {}
        self._active_kpi_filter = None  # v4.1: ACTION 필터
        self._action_map = {}  # pump_id -> action category
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        # ── 상단: 로고 + 타이틀 ────────────────────────
        header = QHBoxLayout()
        logo_label = QLabel()
        if LOGO_PATH.exists():
            pixmap = QPixmap(str(LOGO_PATH))
            logo_label.setPixmap(
                pixmap.scaled(120, 40, Qt.KeepAspectRatio,
                              Qt.SmoothTransformation))
        header.addWidget(logo_label)
        title_label = QLabel(APP_TITLE)
        title_label.setFont(QFont(FONT_FAMILY, 16, QFont.Bold))
        header.addWidget(title_label)
        header.addStretch()
        # v4.5: 월간 리포트 생성 버튼
        self.btn_monthly_report = QPushButton("월간 리포트")
        self.btn_monthly_report.setToolTip("이번 달 운영 리포트 생성 (JSON + Excel)")
        self.btn_monthly_report.setStyleSheet(
            "QPushButton { padding: 4px 12px; border-radius: 4px; "
            "background: #1565C0; color: white; font-weight: bold; }"
            "QPushButton:hover { background: #1976D2; }")
        self.btn_monthly_report.clicked.connect(self._generate_monthly_report)
        header.addWidget(self.btn_monthly_report)
        # v4.3: 백테스트 버튼
        self.btn_backtest = QPushButton("백테스트")
        self.btn_backtest.setToolTip("과거 데이터 기반 분류 정확도 검증")
        self.btn_backtest.setStyleSheet(
            "QPushButton { padding: 4px 12px; border-radius: 4px; "
            "background: #37474F; color: white; font-weight: bold; }"
            "QPushButton:hover { background: #546E7A; }")
        self.btn_backtest.clicked.connect(self._run_backtest)
        header.addWidget(self.btn_backtest)
        layout.addLayout(header)

        # ── v4.1: ACTION 카드 4개 (운영 조치별) ─────────────
        kpi_layout = QHBoxLayout()
        kpi_layout.setSpacing(12)
        self._create_kpi_card(kpi_layout, "즉시점검", "#C62828")
        self._create_kpi_card(kpi_layout, "교체계획", "#EF6C00")
        self._create_kpi_card(kpi_layout, "예방정비", "#F9A825")
        self._create_kpi_card(kpi_layout, "정상", "#2E7D32")
        layout.addLayout(kpi_layout)

        # ── system_wide_drop 경고 박스 ────────────────────
        self._swd_warning = QLabel(
            "\u26A0 전체 수량 저하 감지 — 수위 또는 공급 문제 점검 필요")
        self._swd_warning.setFont(QFont(FONT_FAMILY, 10, QFont.Bold))
        self._swd_warning.setStyleSheet(
            "background: #FFCDD2; color: #B71C1C; border: 2px solid #C62828; "
            "border-radius: 6px; padding: 8px 12px;")
        self._swd_warning.setAlignment(Qt.AlignCenter)
        self._swd_warning.setVisible(False)
        layout.addWidget(self._swd_warning)

        # ── 중앙: 카드 그리드 + 상세 패널 ──────────────
        self.splitter = QSplitter(Qt.Horizontal)

        # 좌: 스크롤 가능한 2열 카드 그리드
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setMinimumWidth(500)
        self.card_container = QWidget()
        self.card_grid = QGridLayout(self.card_container)
        self.card_grid.setSpacing(10)
        self.card_grid.setContentsMargins(8, 8, 8, 8)
        self.card_grid.setAlignment(Qt.AlignTop | Qt.AlignLeft)
        scroll.setWidget(self.card_container)
        self.splitter.addWidget(scroll)

        # 우: 상세 패널 (3구역: 요약헤더 + 비교표 + 판정근거)
        detail_scroll = QScrollArea()
        detail_scroll.setWidgetResizable(True)
        self.detail_panel = QWidget()
        detail_layout = QVBoxLayout(self.detail_panel)
        detail_layout.setSpacing(8)
        detail_layout.setContentsMargins(12, 12, 12, 12)

        # ── (A) 요약 헤더 ─────────────────────────────
        self.detail_title = QLabel("펌프를 선택하세요")
        self.detail_title.setFont(QFont(FONT_FAMILY, 13, QFont.Bold))
        detail_layout.addWidget(self.detail_title)

        self.detail_judgment_badge = QLabel("")
        self.detail_judgment_badge.setAlignment(Qt.AlignLeft)
        self.detail_judgment_badge.setFixedHeight(24)
        self.detail_judgment_badge.setVisible(False)
        detail_layout.addWidget(self.detail_judgment_badge)

        self.detail_period_label = QLabel("")
        self.detail_period_label.setWordWrap(True)
        self.detail_period_label.setStyleSheet(
            "padding: 4px; color: #555; font-size: 9pt;")
        detail_layout.addWidget(self.detail_period_label)

        # ── v4.0: 기준선 프로필 선택 ────────────────────
        bl_profile_row = QHBoxLayout()
        bl_profile_row.addWidget(QLabel("기준선:"))
        self._baseline_combo = QComboBox()
        self._baseline_combo.setMinimumWidth(200)
        self._baseline_combo.addItem("자동(실시간)", userData=None)
        self._baseline_combo.currentIndexChanged.connect(
            self._on_baseline_profile_changed)
        bl_profile_row.addWidget(self._baseline_combo)

        self._btn_save_baseline = QPushButton("현재 기준선 저장")
        self._btn_save_baseline.setFixedHeight(26)
        self._btn_save_baseline.setStyleSheet(
            "QPushButton { background: #4CAF50; color: white; "
            "padding: 3px 8px; border-radius: 3px; font-size: 8pt; }")
        self._btn_save_baseline.clicked.connect(self._save_current_baseline)
        bl_profile_row.addWidget(self._btn_save_baseline)
        bl_profile_row.addStretch()
        detail_layout.addLayout(bl_profile_row)

        # 사이클 정보 라벨
        self._cycle_info_label = QLabel("")
        self._cycle_info_label.setStyleSheet(
            "color: #1565C0; font-size: 9pt; padding: 2px 4px;")
        self._cycle_info_label.setVisible(False)
        detail_layout.addWidget(self._cycle_info_label)

        # ── v4.6: 수동 기준선 설정 UI ─────────────────
        manual_bl_group = QGroupBox("기준선 설정")
        manual_bl_layout = QVBoxLayout()
        manual_bl_layout.setSpacing(4)

        self._radio_auto_bl = QRadioButton("자동 기준선 사용")
        self._radio_manual_bl = QRadioButton("수동 기준선 사용")
        self._radio_auto_bl.setChecked(True)
        bl_radio_group = QButtonGroup(self)
        bl_radio_group.addButton(self._radio_auto_bl)
        bl_radio_group.addButton(self._radio_manual_bl)
        manual_bl_layout.addWidget(self._radio_auto_bl)
        manual_bl_layout.addWidget(self._radio_manual_bl)

        manual_input_row = QHBoxLayout()
        manual_input_row.addWidget(QLabel("기준 유량:"))
        self._input_manual_bl = QLineEdit()
        self._input_manual_bl.setPlaceholderText("예: 1.54")
        self._input_manual_bl.setFixedWidth(100)
        manual_input_row.addWidget(self._input_manual_bl)
        manual_input_row.addWidget(QLabel("m\u00b3/h"))

        self._btn_apply_manual_bl = QPushButton("적용")
        self._btn_apply_manual_bl.setFixedHeight(26)
        self._btn_apply_manual_bl.setStyleSheet(
            "QPushButton { background: #EF6C00; color: white; "
            "padding: 3px 10px; border-radius: 3px; font-weight: bold; }")
        self._btn_apply_manual_bl.clicked.connect(
            self._apply_manual_baseline)
        manual_input_row.addWidget(self._btn_apply_manual_bl)

        self._btn_reset_manual_bl = QPushButton("자동 복귀")
        self._btn_reset_manual_bl.setFixedHeight(26)
        self._btn_reset_manual_bl.setStyleSheet(
            "QPushButton { background: #78909C; color: white; "
            "padding: 3px 10px; border-radius: 3px; }")
        self._btn_reset_manual_bl.clicked.connect(
            self._reset_manual_baseline)
        manual_input_row.addWidget(self._btn_reset_manual_bl)
        manual_input_row.addStretch()
        manual_bl_layout.addLayout(manual_input_row)

        self._manual_bl_status = QLabel("")
        self._manual_bl_status.setStyleSheet(
            "color: #D97706; font-weight: bold; padding: 2px;")
        self._manual_bl_status.setVisible(False)
        manual_bl_layout.addWidget(self._manual_bl_status)

        manual_bl_group.setLayout(manual_bl_layout)
        detail_layout.addWidget(manual_bl_group)

        # ── (B) 비교 표 ───────────────────────────────
        compare_group = QGroupBox("기준 대비 비교")
        compare_layout = QVBoxLayout()
        self.compare_table = QTableWidget()
        self.compare_table.setColumnCount(4)
        self.compare_table.setHorizontalHeaderLabels(
            ["항목", "기준", "최근", "변화"])
        self.compare_table.horizontalHeader().setSectionResizeMode(
            QHeaderView.Stretch)
        self.compare_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.compare_table.setMaximumHeight(130)
        self.compare_table.verticalHeader().setVisible(False)
        compare_layout.addWidget(self.compare_table)

        # 계산식 설명 (고정)
        formula_label = QLabel(
            "하락률(%) = (최근 평균 유량 \u2212 기준 평균 유량) "
            "/ 기준 평균 유량 \u00D7 100")
        formula_label.setStyleSheet(
            "color: #777; font-size: 8pt; font-style: italic; "
            "padding: 2px 4px;")
        formula_label.setWordWrap(True)
        compare_layout.addWidget(formula_label)

        compare_group.setLayout(compare_layout)
        detail_layout.addWidget(compare_group)

        # ── 장기 추이 차트 (접이식) ──────────────────
        chart_group = QGroupBox("장기 유량 추이")
        chart_group.setCheckable(True)
        chart_group.setChecked(False)
        chart_vlayout = QVBoxLayout()
        self._trend_figure = Figure(figsize=(5, 2.5), dpi=80)
        self._trend_canvas = FigureCanvas(self._trend_figure)
        self._trend_canvas.setMinimumHeight(180)
        self._trend_canvas.setMaximumHeight(250)
        chart_vlayout.addWidget(self._trend_canvas)
        chart_group.setLayout(chart_vlayout)
        detail_layout.addWidget(chart_group)
        self._chart_group = chart_group
        chart_group.toggled.connect(self._on_chart_toggled)

        # ── 3축 바 시각화 ─────────────────────────────
        bars_group = QGroupBox("분석 지표")
        bars_layout = QVBoxLayout()
        bars_layout.setSpacing(10)

        self._bar_degradation = self._create_analysis_bar(
            bars_layout, "유량 하락률", -30, 5, "%")
        self._bar_on_time = self._create_analysis_bar(
            bars_layout, "가동시간 감소", -50, 5, "%")
        self._bar_repeat = self._create_analysis_bar(
            bars_layout, "반복점수", 0, 1, "")

        bars_group.setLayout(bars_layout)
        detail_layout.addWidget(bars_group)

        # ── 주요 지표 ─────────────────────────────────
        metrics_group = QGroupBox("주요 지표")
        metrics_layout = QFormLayout()
        metrics_layout.setSpacing(6)

        metric_keys = [
            ("baseline_source", "기준선 출처"),
            ("duty_cycle", "가동률"),
            ("avg_on_duration", "평균 가동시간"),
            ("max_on_duration", "최대 가동시간"),
            ("micro_cycle_detected", "미세 OFF 감지"),
            ("system_wide_drop", "전체 수량 저하"),
            ("flow_risk_weight", "유량 위험가중치"),
        ]
        for key, label in metric_keys:
            val_label = QLabel("-")
            val_label.setFont(QFont(FONT_MONO, 10))
            metrics_layout.addRow(QLabel(label), val_label)
            self._detail_metrics_labels[key] = val_label

        metrics_group.setLayout(metrics_layout)
        detail_layout.addWidget(metrics_group)

        # ── (C) 판정 근거 ─────────────────────────────
        self.detail_reason_group = QGroupBox("판정 근거")
        reason_layout = QVBoxLayout()
        self.detail_reason_label = QLabel("-")
        self.detail_reason_label.setWordWrap(True)
        self.detail_reason_label.setTextInteractionFlags(
            Qt.TextSelectableByMouse)
        self.detail_reason_label.setStyleSheet("padding: 4px;")
        reason_layout.addWidget(self.detail_reason_label)

        # 판정 기준 표시
        settings = load_settings()
        thresholds_text = (
            f"판정 기준: "
            f"경과관찰 {settings.get('degradation_watch', -5)}% / "
            f"점검권장 {settings.get('degradation_warning', -10)}% / "
            f"정밀점검 {settings.get('degradation_severe', -20)}%"
        )
        threshold_lbl = QLabel(thresholds_text)
        threshold_lbl.setStyleSheet(
            "color: #888; font-size: 8pt; padding: 2px 4px;")
        reason_layout.addWidget(threshold_lbl)

        self.detail_reason_group.setLayout(reason_layout)
        detail_layout.addWidget(self.detail_reason_group)

        # ── 교체 예측 블록 (v3.5.1) ─────────────────────
        self._forecast_group = QGroupBox("교체 시점 예측")
        forecast_layout = QVBoxLayout()
        forecast_layout.setSpacing(4)

        self._forecast_months_label = QLabel("-")
        self._forecast_months_label.setFont(QFont(FONT_MONO, 14, QFont.Bold))
        self._forecast_months_label.setAlignment(Qt.AlignCenter)
        forecast_layout.addWidget(self._forecast_months_label)

        self._forecast_detail_label = QLabel("-")
        self._forecast_detail_label.setFont(QFont(FONT_FAMILY, 9))
        self._forecast_detail_label.setAlignment(Qt.AlignCenter)
        self._forecast_detail_label.setStyleSheet("color: #555;")
        forecast_layout.addWidget(self._forecast_detail_label)

        self._forecast_group.setLayout(forecast_layout)
        self._forecast_group.setVisible(False)
        detail_layout.addWidget(self._forecast_group)

        # 케이싱 이력 (최근 5건)
        self.casing_group = QGroupBox("최근 케이싱 교체 이력")
        casing_layout = QVBoxLayout()
        self.casing_table = QTableWidget()
        self.casing_table.setColumnCount(3)
        self.casing_table.setHorizontalHeaderLabels(
            ["교체일", "사유", "메모"])
        self.casing_table.horizontalHeader().setSectionResizeMode(
            QHeaderView.Stretch)
        self.casing_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.casing_table.setMaximumHeight(120)
        casing_layout.addWidget(self.casing_table)
        self.casing_group.setLayout(casing_layout)
        detail_layout.addWidget(self.casing_group)

        detail_layout.addStretch()
        detail_scroll.setWidget(self.detail_panel)
        self.splitter.addWidget(detail_scroll)
        self.splitter.setSizes([500, 500])

        layout.addWidget(self.splitter, stretch=1)

    def _create_kpi_card(self, parent_layout, title: str, color: str):
        """KPI 카드 1개 생성."""
        card = QFrame()
        card.setFrameShape(QFrame.NoFrame)
        card.setMinimumHeight(120)
        card.setStyleSheet(
            f"background-color: {color}; border-radius: 8px;")

        card_layout = QVBoxLayout(card)
        card_layout.setSpacing(4)
        card_layout.setContentsMargins(14, 14, 14, 14)
        card_layout.setAlignment(Qt.AlignCenter)

        lbl_title = QLabel(title)
        lbl_title.setObjectName("kpiTitle")
        lbl_title.setAlignment(Qt.AlignCenter)
        lbl_title.setStyleSheet(
            "color: #FFFFFF; background: transparent; border: none; "
            "font-size: 18px; font-weight: bold;")
        card_layout.addWidget(lbl_title)

        lbl_value = QLabel("0")
        lbl_value.setObjectName("kpiValue")
        lbl_value.setAlignment(Qt.AlignCenter)
        lbl_value.setStyleSheet(
            "color: #FFFFFF; background: transparent; border: none; "
            "font-size: 38px; font-weight: 700;")
        card_layout.addWidget(lbl_value)

        self._kpi_value_labels[title] = lbl_value
        card.setCursor(Qt.PointingHandCursor)
        card.mousePressEvent = (
            lambda event, t=title: self._on_kpi_card_click(t))
        parent_layout.addWidget(card)

    def _on_kpi_card_click(self, category: str):
        """ACTION 카드 클릭 -> 해당 카테고리 펌프만 표시 (토글)."""
        if self._active_kpi_filter == category:
            self._active_kpi_filter = None
        else:
            self._active_kpi_filter = category
        self._rebuild_card_grid()

    def _generate_monthly_report(self):
        """v4.5: 월간 운영 리포트 생성 (월 선택 다이얼로그)."""
        from src.report_generator import generate_monthly_report

        # 기본값: 전월
        now = datetime.now()
        if now.month == 1:
            default_year, default_month = now.year - 1, 12
        else:
            default_year, default_month = now.year, now.month - 1

        # 최근 12개월 옵션 생성
        dlg = QDialog(self)
        dlg.setWindowTitle("월간 리포트 생성")
        dlg.setMinimumWidth(300)
        dlg_layout = QVBoxLayout(dlg)

        dlg_layout.addWidget(QLabel("리포트 대상 월을 선택하세요:"))
        combo = QComboBox()
        y, m = now.year, now.month
        default_idx = 0
        for i in range(12):
            label = f"{y}-{m:02d}"
            combo.addItem(label, (y, m))
            if y == default_year and m == default_month:
                default_idx = i
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        combo.setCurrentIndex(default_idx)
        dlg_layout.addWidget(combo)

        btn_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        btn_box.accepted.connect(dlg.accept)
        btn_box.rejected.connect(dlg.reject)
        dlg_layout.addWidget(btn_box)

        if dlg.exec() != QDialog.Accepted:
            return

        sel_year, sel_month = combo.currentData()

        self.btn_monthly_report.setEnabled(False)
        self.btn_monthly_report.setText("생성중...")
        QApplication.processEvents()
        try:
            result = generate_monthly_report(sel_year, sel_month)
            if result["json_path"] is None:
                QMessageBox.information(
                    self, "월간 리포트",
                    f"{sel_year}-{sel_month:02d} 분석 로그가 없어 "
                    "리포트를 생성할 수 없습니다.")
            else:
                score = result["report"].get("stability_score", "-")
                risk_cnt = result["report"].get(
                    "risk_outlook_next_month", {}).get("high_risk_count", 0)
                QMessageBox.information(
                    self, "월간 리포트 생성 완료",
                    f"기간: {sel_year}-{sel_month:02d}\n"
                    f"안정성 점수: {score}/100\n"
                    f"고위험 펌프: {risk_cnt}개\n\n"
                    f"JSON: {result['json_path']}\n"
                    f"Excel: {result['xlsx_path']}")
        except Exception as e:
            QMessageBox.warning(self, "월간 리포트 오류", str(e))
        finally:
            self.btn_monthly_report.setEnabled(True)
            self.btn_monthly_report.setText("월간 리포트")

    def _run_backtest(self):
        """v4.4: 백테스트 실행 및 탭 다이얼로그 표시."""
        self.btn_backtest.setEnabled(False)
        self.btn_backtest.setText("백테스트 실행중...")
        QApplication.processEvents()
        try:
            bt = run_backtest_all()
        except Exception as e:
            QMessageBox.warning(self, "백테스트 오류", str(e))
            return
        finally:
            self.btn_backtest.setEnabled(True)
            self.btn_backtest.setText("백테스트")

        s = bt["summary"]
        dlg = QDialog(self)
        dlg.setWindowTitle("백테스트 결과 — 분류 정확도 검증 (v4.4)")
        dlg.setMinimumSize(800, 560)
        dlg_layout = QVBoxLayout(dlg)

        tabs = QTabWidget()

        # ── TAB 1: 종합 요약 ──────────────────────
        tab1 = QWidget()
        t1_layout = QVBoxLayout(tab1)

        summary_box = QGroupBox("종합 통계")
        sf = QFormLayout(summary_box)
        sf.addRow("분석 펌프 수:", QLabel(f"{s['total_pumps']}대"))
        sf.addRow("실제 리셋 이벤트:", QLabel(f"{s['total_reset_events']}건"))
        sf.addRow("정탐 (TP):", QLabel(f"{s['total_tp']}건"))
        sf.addRow("오탐 (FP):", QLabel(f"{s['total_fp']}건"))
        sf.addRow("미탐 (FN):", QLabel(f"{s['total_fn']}건"))
        fp_lbl = QLabel(f"{s['오탐률']:.1f}%")
        fn_lbl = QLabel(f"{s['미탐률']:.1f}%")
        if s['오탐률'] > 50:
            fp_lbl.setStyleSheet("color: #C62828; font-weight: bold;")
        if s['미탐률'] > 50:
            fn_lbl.setStyleSheet("color: #C62828; font-weight: bold;")
        sf.addRow("오탐률:", fp_lbl)
        sf.addRow("미탐률:", fn_lbl)
        early_text = (f"{s['avg_early_warning_days']:.1f}일"
                      if s['avg_early_warning_days'] is not None else "—")
        sf.addRow("평균 조기 경고:", QLabel(early_text))
        t1_layout.addWidget(summary_box)

        # 조기경고 분포
        ed = s.get("early_warning_dist", {})
        dist_box = QGroupBox("조기경고 분포")
        df = QFormLayout(dist_box)
        df.addRow("0~7일:", QLabel(f"{ed.get('0_7', 0)}건"))
        df.addRow("7~14일:", QLabel(f"{ed.get('7_14', 0)}건"))
        df.addRow("14~30일:", QLabel(f"{ed.get('14_30', 0)}건"))
        t1_layout.addWidget(dist_box)

        # FP 에피소드 통계
        fp_box = QGroupBox("오탐(FP) 에피소드 지속성")
        fpf = QFormLayout(fp_box)
        fpf.addRow("총 에피소드:", QLabel(f"{s['total_fp']}건"))
        fpf.addRow("평균 지속일:",
                    QLabel(f"{s.get('avg_fp_episode_length', 0):.1f}일"))
        fpf.addRow("최대 지속일:",
                    QLabel(f"{s.get('max_fp_episode_length', 0)}일"))
        t1_layout.addWidget(fp_box)
        t1_layout.addStretch()
        tabs.addTab(tab1, "종합 요약")

        # ── TAB 2: Reason별 TP/FP/FN ──────────────
        tab2 = QWidget()
        t2_layout = QVBoxLayout(tab2)
        reason_stats = s.get("reason_stats", {})
        rt = QTableWidget()
        rt.setColumnCount(4)
        rt.setHorizontalHeaderLabels(["Reason", "TP", "FP", "FN"])
        reason_kr = {
            "deg_severe": "심각열화(deg<=severe)",
            "months_left": "교체예측(months_left)",
            "rolling": "연속급락(rolling)",
            "deg_warning": "주의열화(deg<=warning)",
            "none": "(미분류)",
        }
        rt.setRowCount(len(reason_stats))
        for i, (rsn, cnt) in enumerate(reason_stats.items()):
            rt.setItem(i, 0, QTableWidgetItem(reason_kr.get(rsn, rsn)))
            rt.setItem(i, 1, QTableWidgetItem(str(cnt["tp"])))
            rt.setItem(i, 2, QTableWidgetItem(str(cnt["fp"])))
            rt.setItem(i, 3, QTableWidgetItem(str(cnt["fn"])))
        rt.setAlternatingRowColors(True)
        rt.setEditTriggers(QTableWidget.NoEditTriggers)
        rt.horizontalHeader().setStretchLastSection(True)
        rt.resizeColumnsToContents()
        t2_layout.addWidget(QLabel("분류 근거(reason)별 정탐/오탐/미탐 분포"))
        t2_layout.addWidget(rt)
        tabs.addTab(tab2, "Reason별 분석")

        # ── TAB 3: 펌프별 상세 ─────────────────────
        tab3 = QWidget()
        t3_layout = QVBoxLayout(tab3)
        table = QTableWidget()
        headers = ["펌프 ID", "분석일수", "경고일수", "리셋이벤트",
                    "TP", "FP", "FN", "오탐률(%)", "미탐률(%)", "조기경고(일)"]
        table.setColumnCount(len(headers))
        table.setHorizontalHeaderLabels(headers)
        table.setRowCount(len(bt["per_pump"]))
        table.setAlternatingRowColors(True)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.horizontalHeader().setStretchLastSection(True)
        for row, r in enumerate(bt["per_pump"]):
            table.setItem(row, 0, QTableWidgetItem(r["pump_id"]))
            table.setItem(row, 1, QTableWidgetItem(str(r["total_days"])))
            table.setItem(row, 2, QTableWidgetItem(str(r["alert_days"])))
            table.setItem(row, 3, QTableWidgetItem(str(r["reset_events"])))
            table.setItem(row, 4, QTableWidgetItem(str(r["true_positives"])))
            table.setItem(row, 5, QTableWidgetItem(str(r["false_positives"])))
            table.setItem(row, 6, QTableWidgetItem(str(r["false_negatives"])))
            table.setItem(row, 7, QTableWidgetItem(f"{r['오탐률']:.1f}"))
            table.setItem(row, 8, QTableWidgetItem(f"{r['미탐률']:.1f}"))
            early = (f"{r['avg_early_warning_days']:.1f}"
                     if r.get('avg_early_warning_days') is not None else "—")
            table.setItem(row, 9, QTableWidgetItem(early))
        table.resizeColumnsToContents()
        t3_layout.addWidget(table)
        tabs.addTab(tab3, "펌프별 상세")

        dlg_layout.addWidget(tabs)
        btn_box = QDialogButtonBox(QDialogButtonBox.Close)
        btn_box.rejected.connect(dlg.close)
        dlg_layout.addWidget(btn_box)
        dlg.exec()

    def _create_analysis_bar(self, parent_layout, title: str,
                              min_val: float, max_val: float,
                              suffix: str) -> dict:
        """분석 지표 수평 바 1개 생성."""
        row = QHBoxLayout()

        lbl_title = QLabel(title)
        lbl_title.setFixedWidth(100)
        lbl_title.setFont(QFont(FONT_FAMILY, 9))
        row.addWidget(lbl_title)

        bar_bg = QFrame()
        bar_bg.setFixedHeight(24)
        bar_bg.setStyleSheet(
            "QFrame { background: #E0E0E0; border-radius: 4px; }")
        bar_bg.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

        bar_fill = QFrame(bar_bg)
        bar_fill.setFixedHeight(24)
        bar_fill.setStyleSheet(
            "QFrame { background: #2E7D32; border-radius: 4px; }")
        bar_fill.setGeometry(0, 0, 0, 24)

        row.addWidget(bar_bg)

        lbl_value = QLabel("-")
        lbl_value.setFixedWidth(70)
        lbl_value.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        lbl_value.setFont(QFont(FONT_MONO, 10))
        row.addWidget(lbl_value)

        parent_layout.addLayout(row)

        return {
            "bg": bar_bg, "fill": bar_fill, "label": lbl_value,
            "min": min_val, "max": max_val, "suffix": suffix,
        }

    # ── v4.0: 기준선 프로필 메서드 ──────────────────────
    def _refresh_baseline_combo(self, pump_id: str):
        """기준선 드롭다운을 해당 펌프 프로필 목록으로 갱신."""
        self._baseline_combo.blockSignals(True)
        self._baseline_combo.clear()
        self._baseline_combo.addItem("자동(실시간)", userData=None)

        profiles = get_baseline_profiles(pump_id)
        for p in profiles:
            lock = "[L] " if p.get("locked") else ""
            label = (f"{lock}{p['baseline_value']:.2f}  "
                     f"({p['baseline_period_start']}~"
                     f"{p['baseline_period_end']})  "
                     f"{p.get('description', '')}")
            self._baseline_combo.addItem(label, userData=p["id"])

        self._baseline_combo.blockSignals(False)

    def _on_baseline_profile_changed(self, index: int):
        """드롭다운 변경 → 해당 프로필로 단일 펌프 재분석."""
        if not self._selected_pump_id:
            return
        profile_id = self._baseline_combo.currentData()
        try:
            result = analyze_pump(self._selected_pump_id,
                                  baseline_profile_id=profile_id)
            self._results_cache[self._selected_pump_id] = result
            self._update_detail_panel(self._selected_pump_id)
        except Exception as e:
            logger.error(f"프로필 재분석 실패: {e}")

    def _save_current_baseline(self):
        """현재 자동산출 기준선을 프로필로 저장."""
        if not self._selected_pump_id:
            return
        result = self._results_cache.get(self._selected_pump_id, {})
        auto_bl = result.get("auto_baseline")
        if auto_bl is None:
            QMessageBox.warning(self, "저장 불가",
                                "자동산출 기준선이 없습니다.")
            return
        bl_ps = result.get("baseline_period_start", "")
        bl_pe = result.get("baseline_period_end", "")
        cycle_id = result.get("cycle_id")
        today = datetime.now().strftime("%Y-%m-%d")
        try:
            save_baseline_profile(
                pump_id=self._selected_pump_id,
                baseline_value=auto_bl,
                period_start=bl_ps, period_end=bl_pe,
                description=f"수동 저장 ({today})",
                cycle_id=cycle_id, locked=True)
            QMessageBox.information(
                self, "저장 완료",
                f"기준선 {auto_bl:.2f} m\u00b3/h 저장")
            self._refresh_baseline_combo(self._selected_pump_id)
        except Exception as e:
            QMessageBox.critical(self, "저장 실패", str(e))

    # ── v4.6: 수동 기준선 적용/복귀 ──────────────────────
    def _apply_manual_baseline(self):
        """수동 기준선 적용."""
        pid = self._selected_pump_id
        if not pid:
            QMessageBox.warning(self, "알림", "펌프를 먼저 선택하세요.")
            return
        text = self._input_manual_bl.text().strip()
        try:
            value = float(text)
        except (ValueError, TypeError):
            QMessageBox.warning(self, "입력 오류",
                                "유효한 숫자를 입력하세요.")
            return
        if value <= 0:
            QMessageBox.warning(self, "입력 오류",
                                "0보다 큰 값을 입력하세요.")
            return
        save_manual_baseline(pid, value)
        self._radio_manual_bl.setChecked(True)
        QMessageBox.information(
            self, "완료",
            f"수동 기준선 {value:.2f} m\u00b3/h 이 적용되었습니다.")
        self._update_detail_panel(pid)

    def _reset_manual_baseline(self):
        """수동 기준선 해제 → 자동 복귀."""
        pid = self._selected_pump_id
        if not pid:
            return
        clear_manual_baseline(pid)
        self._radio_auto_bl.setChecked(True)
        self._input_manual_bl.clear()
        QMessageBox.information(
            self, "완료", "자동 기준선으로 복귀했습니다.")
        self._update_detail_panel(pid)

    def _on_chart_toggled(self, checked: bool):
        """차트 그룹박스 열림/닫힘 시 렌더/해제."""
        if checked:
            if self._selected_pump_id:
                self._draw_trend_chart(self._selected_pump_id)
        else:
            # 접힘: figure clear + canvas 참조 해제로 누적 방지
            self._trend_figure.clear()
            self._trend_canvas.draw()

    def _draw_trend_chart(self, pump_id: str):
        """장기 유량 추이 차트 (일평균 + 7일 MA + 기준선)."""
        from src.analyzer import get_pump_trend_data
        df = get_pump_trend_data(pump_id)
        if df.empty:
            return

        fig = self._trend_figure
        fig.clear()
        ax = fig.add_subplot(111)

        ax.plot(df["date"], df["avg_flow"], alpha=0.3, linewidth=0.8,
                color="#90CAF9", label="일평균")
        ax.plot(df["date"], df["ma7"], linewidth=1.5,
                color="#1565C0", label="7일 이동평균")

        # rolling baseline 수평선
        result = self._results_cache.get(pump_id, {})
        bl = result.get("baseline_value")
        if bl:
            ax.axhline(bl, color="#2E7D32", linestyle="--",
                       linewidth=1, label=f"기준선 {bl:.2f}")

        # post_casing baseline 수평선
        pc_bl = result.get("post_casing_baseline")
        if pc_bl:
            ax.axhline(pc_bl, color="#EF6C00", linestyle=":",
                       linewidth=1, label=f"교체 후 {pc_bl:.2f}")

        # 케이싱 교체일 수직선
        casings = get_casing_history_recent(pump_id, limit=5)
        for ev in casings:
            try:
                cd = pd.Timestamp(ev["change_date"])
                ax.axvline(cd, color="#C62828", linestyle="-.",
                           alpha=0.5, linewidth=0.8)
            except Exception:
                pass

        ax.set_ylabel("유량(m\u00b3/h)", fontsize=8)
        ax.tick_params(labelsize=7)
        ax.legend(fontsize=7, loc="upper left")
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d"))
        fig.tight_layout(pad=1.0)
        self._trend_canvas.draw()

    def _update_bar(self, bar_info: dict, value, color: str = None):
        """수평 바 갱신: 폭/색상/라벨. 범위 초과 시 동적 확장 + 캡 표시."""
        if value is None:
            bar_info["fill"].setGeometry(0, 0, 0, 24)
            bar_info["label"].setText("-")
            return

        mn, mx = bar_info["min"], bar_info["max"]

        # 동적 스케일: 값이 원래 범위를 벗어나면 확장
        eff_min = min(mn, value)
        eff_max = max(mx, value)
        clamped = value < mn or value > mx

        total_w = bar_info["bg"].width()
        if total_w <= 0:
            total_w = 200  # fallback before layout
        ratio = ((value - eff_min) / (eff_max - eff_min)
                 if eff_max != eff_min else 0)
        fill_w = int(total_w * ratio)
        bar_info["fill"].setGeometry(0, 0, fill_w, 24)

        if color is None:
            color = self._color_for_degradation(value)

        bar_info["fill"].setStyleSheet(
            f"QFrame {{ background: {color}; border-radius: 4px; }}")

        suffix = bar_info["suffix"]
        cap_mark = "\u25BC" if clamped else ""  # ▼ 범위초과 표시
        if suffix == "%":
            bar_info["label"].setText(f"{cap_mark}{value:+.1f}%")
        else:
            bar_info["label"].setText(f"{cap_mark}{value:.3f}")

    @staticmethod
    def _color_for_degradation(val):
        """하락률 → 색상."""
        if val is None:
            return "#9E9E9E"
        if isinstance(val, (int, float)):
            if val < -15:
                return "#C62828"
            if val < -5:
                return "#EF6C00"
        return "#2E7D32"

    @staticmethod
    def _apply_card_style(widget: QFrame, bg_color: str,
                          border_color: str):
        """카드 프레임 스타일 적용 (color 속성 제외, 상속 방지)."""
        widget.setAutoFillBackground(True)
        widget.setStyleSheet(f"""
            QFrame {{
                background-color: {bg_color};
                border: 2px solid {border_color};
                border-radius: 8px; padding: 8px;
            }}
            QFrame:hover {{ border-width: 3px; }}
        """)

    @staticmethod
    def _card_text_colors(border_color: str) -> tuple[str, str, str]:
        """카드 border 색상 기반 텍스트 색상 결정.

        Returns: (title_color, info_color, meta_color)
        RED/ORANGE 계열 카드 → 진한 대비색, 그 외 → 다크 그레이.
        """
        dark_borders = {"#C62828", "#B71C1C", "#EF6C00", "#E65100", "#F44336"}
        if border_color in dark_borders:
            return "#1A1A1A", "#2D2D2D", "#3D3D3D"
        return "#1F2937", "#374151", "#4B5563"

    def _create_pump_card(self, result: dict) -> QFrame:
        """펌프 상태 카드 1개 - 5행 간소화 (v4.1)."""
        pump_id = result.get("pump_id", "")
        judgment = result.get("judgment", "")

        # 판정 색상
        colors = JUDGMENT_CARD_COLORS.get("데이터부족")
        for key, c in JUDGMENT_CARD_COLORS.items():
            if key in judgment:
                colors = c
                break

        title_color, info_color, meta_color = self._card_text_colors(
            colors["border"])

        card = QFrame()
        card.setFrameShape(QFrame.Box)
        card.setCursor(Qt.PointingHandCursor)
        card.setMinimumSize(280, 180)
        card.setMaximumHeight(240)
        card.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        self._apply_card_style(card, colors["bg"], colors["border"])

        card_layout = QVBoxLayout(card)
        card_layout.setSpacing(6)
        card_layout.setContentsMargins(12, 12, 12, 12)

        # Line 1: 펌프명
        pump_info = get_pump_info(pump_id)
        display_name = str(
            result.get("pump_name")
            or (pump_info.get("pump_name") if pump_info else None)
            or pump_id
        )
        lbl_name = QLabel(display_name)
        lbl_name.setFont(QFont("Malgun Gothic", 13, QFont.Bold))
        lbl_name.setWordWrap(True)
        lbl_name.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)
        lbl_name.setMinimumHeight(28)
        lbl_name.setStyleSheet(
            f"color: {title_color}; border: none; "
            "background: transparent;")
        card_layout.addWidget(lbl_name)

        # v4.6: 수동 기준선 배지
        bl_src = result.get("baseline_source", "")
        if bl_src == "manual":
            lbl_manual_badge = QLabel("수동 기준선")
            lbl_manual_badge.setStyleSheet(
                "background: #78909C; color: white; "
                "border-radius: 8px; padding: 1px 8px; "
                "font-size: 9pt; border: none;")
            card_layout.addWidget(lbl_manual_badge, alignment=Qt.AlignLeft)

        # Line 2: 상태배지
        badge_color = colors.get("badge", colors["border"])
        lbl_judgment = QLabel(judgment.split(" / ")[0])
        lbl_judgment.setAlignment(Qt.AlignCenter)
        lbl_judgment.setFixedHeight(24)
        lbl_judgment.setStyleSheet(
            f"background: {badge_color}; color: white; "
            "border-radius: 12px; padding: 2px 14px; "
            "font-weight: bold; border: none; font-size: 11pt;")
        card_layout.addWidget(lbl_judgment, alignment=Qt.AlignLeft)

        # Line 3-5: 지표 (장기열화%, 교체예상, 사이클시작일)
        metrics_grid = QGridLayout()
        metrics_grid.setSpacing(2)

        deg = result.get("degradation_pct")
        deg_color = ("#C62828" if deg is not None and deg <= -20
                     else "#EF6C00" if deg is not None and deg <= -10
                     else info_color)
        deg_str = f"{deg:+.1f}%" if deg is not None else "-"

        # PART C: confidence < 25% → 교체예상 숨김
        forecast = result.get("replacement_forecast")
        if forecast and forecast.get("confidence", 0) >= 25:
            months = f"{forecast['predicted_months_left']:.0f}개월"
        else:
            months = "-"

        cycle_start = result.get("cycle_start_date", "") or "-"

        # PART D: 데이터 30일 미만 경고
        valid_days = result.get("valid_data_days", 0)
        metrics_rows = [
            ("장기열화%", deg_str, deg_color),
            ("교체예상", months, info_color),
            ("사이클시작", cycle_start, meta_color),
        ]
        if valid_days < 30:
            metrics_rows.append(
                ("데이터", f"{valid_days}일 (부족)", "#C62828"))

        # v4.4: 안정화 버퍼 확정대기 표시
        buf = self._stability_map.get(pump_id)
        if buf and buf.get("is_pending"):
            pd_text = f"확정대기 ({buf['pending_days']}/{buf['confirm_target']})"
            metrics_rows.append(("상태", pd_text, "#F57F17"))

        for row_i, (label, value, color) in enumerate(metrics_rows):
            lbl_l = QLabel(label)
            lbl_l.setFont(QFont(FONT_FAMILY, 10))
            lbl_l.setStyleSheet(
                f"color: {meta_color}; border: none; "
                "background: transparent;")
            metrics_grid.addWidget(lbl_l, row_i, 0)

            lbl_v = QLabel(value)
            lbl_v.setFont(QFont(FONT_MONO, 11))
            lbl_v.setStyleSheet(
                f"color: {color}; border: none; "
                "background: transparent;")
            lbl_v.setAlignment(Qt.AlignRight)
            metrics_grid.addWidget(lbl_v, row_i, 1)

        card_layout.addLayout(metrics_grid)

        # v4.4: guidance text
        guidance = self._guidance_map.get(pump_id, "")
        if guidance and guidance != "현재 정상 운전 중입니다. 정기 점검 일정을 유지하세요.":
            lbl_guide = QLabel(guidance)
            lbl_guide.setWordWrap(True)
            lbl_guide.setSizePolicy(
                QSizePolicy.Expanding, QSizePolicy.Minimum)
            lbl_guide.setMaximumHeight(40)
            lbl_guide.setFont(QFont(FONT_FAMILY, 10))
            lbl_guide.setStyleSheet(
                f"color: {meta_color}; border: none; "
                "background: transparent; padding-top: 2px;")
            card_layout.addWidget(lbl_guide)

        card.mousePressEvent = (
            lambda event, pid=pump_id: self._on_card_click(pid))
        return card

    def _on_card_click(self, pump_id: str):
        """카드 클릭 시 상세 패널 갱신."""
        self._selected_pump_id = pump_id
        self._update_detail_panel(pump_id)

    def _update_detail_panel(self, pump_id: str):
        """우측 상세 패널 갱신: 3구역(요약+비교+근거) + 바 + 지표."""
        pump = get_pump_info(pump_id)
        if not pump:
            self.detail_title.setText(f"펌프 {pump_id} (정보 없음)")
            return

        result = self._results_cache.get(pump_id, {})

        # v4.0: 기준선 프로필 드롭다운 갱신
        self._refresh_baseline_combo(pump_id)

        # v4.0: 사이클 정보 표시
        cycle_start = result.get("cycle_start_date", "")
        cycle_warn = result.get("cycle_data_warning", "")
        _evt_type = result.get("cycle_event_type", "")
        _evt_kr = {"casing": "케이싱", "pump_replacement": "펌프교체"
                   }.get(_evt_type, _evt_type)
        if cycle_start:
            _cyc_text = f"현재 성능 사이클 시작일: {cycle_start}"
            if _evt_kr:
                _cyc_text += f" ({_evt_kr})"
            if cycle_warn:
                _cyc_text += f"  [{cycle_warn}]"
            self._cycle_info_label.setText(_cyc_text)
            self._cycle_info_label.setVisible(True)
        else:
            self._cycle_info_label.setVisible(False)

        # ── (A) 요약 헤더 ─────────────────────────────
        pump_name = (pump.get("pump_name") or pump_id)
        op_type = (result.get("operation_type")
                   or pump.get("operation_type_manual")
                   or pump.get("operation_type_auto") or "")
        role_kr = OPERATION_TYPE_KR.get(op_type, "")
        title_suffix = f" [{role_kr}]" if role_kr else ""
        self.detail_title.setText(f"{pump_name}{title_suffix}")

        # 판정 뱃지
        judgment = result.get("judgment", "")
        if judgment:
            j_colors = JUDGMENT_CARD_COLORS.get("데이터부족")
            for key, c in JUDGMENT_CARD_COLORS.items():
                if key in judgment:
                    j_colors = c
                    break
            self.detail_judgment_badge.setText(f"  {judgment}  ")
            self.detail_judgment_badge.setStyleSheet(
                f"background: {j_colors['badge']}; color: white; "
                "border-radius: 10px; padding: 2px 12px; "
                "font-size: 9pt; font-weight: bold;")
            self.detail_judgment_badge.setVisible(True)
        else:
            self.detail_judgment_badge.setVisible(False)

        # v4.1: 기간 정보 - 기준선/분석 데이터 분리 표시
        ps = result.get("period_start", "-")
        pe = result.get("period_end", "-")
        settings = load_settings()
        baseline_days = settings.get("baseline_days", 7)
        auto_bl_days = settings.get("auto_baseline_days", 90)
        bl_src = result.get("baseline_source", "")
        bl_src_kr = BASELINE_SOURCE_KR.get(bl_src, bl_src or "-")

        bl_total = result.get("baseline_sample_total")
        bl_topn = result.get("baseline_top_n")
        bl_warn = result.get("baseline_warning", "")
        baseline_val = result.get("baseline_value")
        deg_pct = result.get("degradation_pct")

        # v4.6: 수동 기준선 UI 상태 갱신
        manual_bl = result.get("manual_baseline_value")
        if manual_bl is not None:
            self._radio_manual_bl.setChecked(True)
            self._input_manual_bl.setText(f"{manual_bl:.2f}")
            self._manual_bl_status.setText(
                f"수동 기준선: {manual_bl:.2f} m\u00b3/h (운영자 설정)")
            self._manual_bl_status.setVisible(True)
        else:
            self._radio_auto_bl.setChecked(True)
            self._input_manual_bl.clear()
            self._manual_bl_status.setVisible(False)

        # (A) 기준선 정보 섹션
        baseline_info = ["[기준선 정보]"]
        if bl_src == "manual":
            baseline_info.append("출처: 수동 기준선 (운영자 설정)")
        elif bl_src == "snapshot":
            _p_desc = result.get("baseline_profile_desc", "")
            baseline_info.append(
                f"출처: 저장 프로필 ({_p_desc})"
                if _p_desc else "출처: 저장 프로필")
            baseline_info.append(
                "* 기준선은 저장 시점 기준이며, "
                "분석 데이터는 최근 성능 사이클 기준입니다.")
        elif "auto" in str(bl_src):
            baseline_info.append(
                f"출처: 자동산출(최근 {auto_bl_days}일 상위 10% 평균)")
        else:
            baseline_info.append(f"출처: {bl_src_kr}")
        if baseline_val is not None:
            if bl_src == "manual":
                baseline_info.append(
                    f"기준값: {baseline_val:.2f} m\u00b3/h (수동)")
            else:
                baseline_info.append(
                    f"기준값: {baseline_val:.2f} m\u00b3/h")
        bl_ps = result.get("baseline_period_start", "")
        bl_pe = result.get("baseline_period_end", "")
        if bl_ps and bl_pe:
            baseline_info.append(f"산출구간: {bl_ps} ~ {bl_pe}")
        if bl_total and bl_topn:
            baseline_info.append(
                f"산출방법: {bl_total}개 샘플 중 상위 {bl_topn}개 평균")
        if bl_warn:
            baseline_info.append(f"* {bl_warn}")
        # v4.4: 기준선 신뢰도 표시
        bl_conf = result.get("baseline_confidence", 0)
        conf_color = ("" if bl_conf >= 70
                      else " (주의)" if bl_conf >= 50
                      else " (낮음 - 분류 제한 적용)")
        baseline_info.append(f"신뢰도: {bl_conf}/100{conf_color}")

        # (B) 분석 데이터 섹션
        valid_data_days = result.get("valid_data_days", 0)
        rps = result.get("recent_period_start", "")
        rpe = result.get("recent_period_end", "")
        recent_actual = result.get("recent_actual_days", 0)
        recent_range = (f"{rps} ~ {rpe}" if rps and rpe
                        else f"최근 {baseline_days}일")

        analysis_info = ["\n[분석 데이터]"]
        analysis_info.append(
            f"분석기간: {ps} ~ {pe} (유효 {valid_data_days}일)")
        analysis_info.append(
            f"최근 비교구간: {recent_range}"
            f" ({recent_actual}일 유효/{baseline_days}일)")
        avg_flow = result.get("avg_flow")
        if avg_flow is not None:
            analysis_info.append(f"현재 평균유량: {avg_flow:.2f} m\u00b3/h")
        if deg_pct is not None:
            analysis_info.append(f"하락률: {deg_pct:+.1f}%")
        recent_warn = result.get("recent_data_warning", "")
        if recent_warn:
            analysis_info.append(f"* {recent_warn}")
        # PART D: 데이터 30일 미만 경고
        if valid_data_days < 30:
            analysis_info.append(
                f"* 유효 데이터 {valid_data_days}일 (<30일) "
                "- 분석 신뢰도 제한, 상위 등급 분류 보류")
        # v4.4: 최근 30일 커버리지
        rcov = result.get("recent_coverage", 0.0)
        cov_warn = (" (상향 제한 적용)" if rcov < 50 else "")
        analysis_info.append(f"최근30일 커버리지: {rcov:.0f}%{cov_warn}")

        # v4.4: guidance text
        guidance = self._guidance_map.get(pump_id, "")
        if guidance:
            analysis_info.append(f"\n[운영 조치 안내]\n{guidance}")

        # v4.4: 안정화 버퍼 상태
        buf = self._stability_map.get(pump_id)
        if buf and buf.get("is_pending"):
            analysis_info.append(
                f"\n* 상향 확정대기 중: {buf['raw']} → "
                f"({buf['pending_days']}/{buf['confirm_target']}일 연속 필요)")

        self.detail_period_label.setText(
            "\n".join(baseline_info + analysis_info))
        # v4.6: 수동 기준선일 때 오렌지 강조
        if bl_src == "manual":
            self.detail_period_label.setStyleSheet(
                "padding: 4px; color: #D97706; font-size: 9pt; "
                "font-weight: bold;")
        else:
            self.detail_period_label.setStyleSheet(
                "padding: 4px; color: #555; font-size: 9pt;")

        # ── (B) 비교 표 ───────────────────────────────
        on_time_deg = result.get("on_time_degradation_pct")
        data_rate = result.get("data_rate")

        # 최근 유량: degradation_pct 역산 (실제 계산에 사용된 값)
        # deg = (recent - baseline) / baseline * 100
        # → recent = baseline * (1 + deg/100)
        if baseline_val is not None and deg_pct is not None:
            recent_flow = baseline_val * (1 + deg_pct / 100)
            recent_str = f"{recent_flow:.2f}"
        else:
            avg_flow = result.get("avg_flow")
            recent_str = f"{avg_flow:.2f}" if avg_flow is not None else "-"

        compare_rows = [
            (f"평균 유량(m\u00b3/h) [최근{baseline_days}일]",
             f"{baseline_val:.2f}" if baseline_val is not None else "-",
             recent_str,
             f"{deg_pct:+.1f}%" if deg_pct is not None else "-",
             deg_pct),
        ]
        # 가동시간 (있으면)
        on_bl = result.get("on_time_baseline")
        on_avg = result.get("daily_avg_on_minutes")
        if on_bl is not None or on_avg is not None:
            compare_rows.append((
                "가동시간(분/일)",
                f"{on_bl:.0f}" if on_bl is not None else "-",
                f"{on_avg:.0f}" if on_avg is not None else "-",
                f"{on_time_deg:+.1f}%" if on_time_deg is not None else "-",
                on_time_deg))
        # 교체 후 기준선 비교 (v3.5)
        pc_bl = result.get("post_casing_baseline")
        pc_deg = result.get("post_casing_degradation_pct")
        pc_date = result.get("post_casing_date", "")
        if pc_bl is not None:
            if pc_bl > 0 and pc_deg is not None:
                pc_recent = pc_bl * (1 + pc_deg / 100)
                pc_recent_str = f"{pc_recent:.2f}"
            else:
                pc_recent_str = recent_str
            compare_rows.append((
                f"교체 후 기준(m\u00b3/h) [{pc_date}~]",
                f"{pc_bl:.2f}",
                pc_recent_str,
                f"{pc_deg:+.1f}%" if pc_deg is not None else "-",
                pc_deg))

        # 데이터 수집률 (있으면)
        if data_rate is not None:
            compare_rows.append((
                "데이터 수집률",
                "100%",
                f"{data_rate:.1f}%",
                "",
                None))

        self.compare_table.setRowCount(len(compare_rows))
        for i, (name, base, recent, change, val) in enumerate(compare_rows):
            self.compare_table.setItem(i, 0, QTableWidgetItem(name))
            item_base = QTableWidgetItem(base)
            item_base.setFont(QFont(FONT_MONO, 9))
            self.compare_table.setItem(i, 1, item_base)
            item_recent = QTableWidgetItem(recent)
            item_recent.setFont(QFont(FONT_MONO, 9))
            self.compare_table.setItem(i, 2, item_recent)
            item_change = QTableWidgetItem(change)
            item_change.setFont(QFont(FONT_MONO, 9))
            if val is not None and isinstance(val, (int, float)):
                if val < -10:
                    item_change.setForeground(QColor("#C62828"))
                elif val < -5:
                    item_change.setForeground(QColor("#EF6C00"))
            self.compare_table.setItem(i, 3, item_change)

        # ── 3축 바 갱신 (레이아웃 완료 후 실행) ────────
        def _deferred_bars():
            self._update_bar(
                self._bar_degradation,
                result.get("degradation_pct"),
                self._color_for_degradation(result.get("degradation_pct")))
            self._update_bar(
                self._bar_on_time,
                result.get("on_time_degradation_pct"),
                self._color_for_degradation(
                    result.get("on_time_degradation_pct")))
            trs = result.get("timer_repeat_score")
            trs_color = ("#C62828" if trs is not None and trs > 0.7
                         else ("#E65100" if trs is not None and trs > 0.4
                               else "#2E7D32"))
            self._update_bar(self._bar_repeat, trs, trs_color)

        QTimer.singleShot(0, _deferred_bars)

        # ── 주요 지표 갱신 ─────────────────────────────
        metric_fmt = {
            "baseline_source": lambda v:
                BASELINE_SOURCE_KR.get(v, str(v or "-")),
            "duty_cycle": lambda v: (
                f"{v:.1%}" if v is not None else "-"),
            "avg_on_duration": lambda v: (
                f"{v:.0f}분" if v is not None else "-"),
            "max_on_duration": lambda v: (
                f"{v:.0f}분" if v is not None else "-"),
            "micro_cycle_detected": lambda v: (
                "감지" if v else "정상"),
            "system_wide_drop": lambda v: (
                "감지" if v else "정상"),
            "flow_risk_weight": lambda v: (
                f"{v:.2f}" if v is not None else "-"),
        }
        for key, lbl in self._detail_metrics_labels.items():
            val = result.get(key)
            fmt = metric_fmt.get(
                key, lambda x: str(x) if x is not None else "-")
            lbl.setText(fmt(val))

        # ── (C) 판정 근거 ─────────────────────────────
        reason = result.get("status_reason", "")
        self.detail_reason_label.setText(reason if reason else "-")

        # 케이싱 이력 (최근 5건)
        casings = get_casing_history_recent(pump_id, limit=5)
        self.casing_table.setRowCount(len(casings))
        for i, ev in enumerate(casings):
            self.casing_table.setItem(
                i, 0, QTableWidgetItem(ev["change_date"]))
            self.casing_table.setItem(
                i, 1, QTableWidgetItem(ev.get("reason", "")))
            self.casing_table.setItem(
                i, 2, QTableWidgetItem(ev.get("memo", "")))

        # ── 교체 예측 블록 갱신 (v3.5.1 / v4.2 confidence gate) ──
        forecast = result.get("replacement_forecast")
        if forecast and forecast.get("confidence", 0) >= 25:
            months = forecast["predicted_months_left"]
            rate = forecast["monthly_drop_rate"]
            conf = forecast["confidence"]

            # 색상: months_left 기준
            if months <= 3:
                fg_color = "#C62828"
                bg_color = "#FFEBEE"
                border_color = "#C62828"
            elif months <= 6:
                fg_color = "#EF6C00"
                bg_color = "#FFF3E0"
                border_color = "#EF6C00"
            elif months <= 12:
                fg_color = "#F57F17"
                bg_color = "#FFFDE7"
                border_color = "#F57F17"
            else:
                fg_color = "#2E7D32"
                bg_color = "#E8F5E9"
                border_color = "#2E7D32"

            if months == 0:
                months_text = "즉시 점검 필요"
            else:
                months_text = f"예상 교체 시점: {months:.0f}개월 후"

            self._forecast_months_label.setText(months_text)
            self._forecast_months_label.setStyleSheet(
                f"color: {fg_color}; padding: 4px;")
            self._forecast_detail_label.setText(
                f"월 평균 감소율: {rate:+.2f}%/월  |  "
                f"신뢰도: {conf:.0f}%  |  "
                f"분석 데이터: {forecast['data_days']}일")
            self._forecast_group.setStyleSheet(
                f"QGroupBox {{ background: {bg_color}; "
                f"border: 1px solid {border_color}; border-radius: 6px; "
                f"margin-top: 8px; padding-top: 16px; }}")
            self._forecast_group.setVisible(True)
        else:
            self._forecast_group.setVisible(False)

        # 차트 갱신 (접이식 열림 시)
        if hasattr(self, '_chart_group') and self._chart_group.isChecked():
            self._draw_trend_chart(pump_id)

    def _write_analysis_log(self, results: list):
        """분석 결과를 analysis_log.txt에 append 기록."""
        if not results:
            return
        try:
            from src.config import OUTPUT_DIR
            log_path = OUTPUT_DIR / "analysis_log.txt"
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            lines = []
            for r in results:
                j = r.get("judgment", "")
                if j in ("데이터없음", ""):
                    continue
                lines.append(
                    f"{ts}\t"
                    f"{r.get('pump_id', '')}\t"
                    f"{r.get('pump_name', '')}\t"
                    f"{j}\t"
                    f"{r.get('degradation_pct', '')}\t"
                    f"{r.get('on_time_degradation_pct', '')}\t"
                    f"{r.get('timer_repeat_score', '')}\t"
                    f"{r.get('system_wide_drop', '')}"
                )
            if lines:
                with open(log_path, "a", encoding="utf-8") as f:
                    for line in lines:
                        f.write(line + "\n")
        except Exception:
            logger.debug("analysis_log write failed", exc_info=True)

    def set_expert_mode(self, enabled: bool):
        """전문가 모드 토글 → 카드 재생성."""
        self._expert_mode = enabled
        self.refresh()

    def refresh(self):
        """대시보드 전체 갱신."""
        # _last_results 우선 (v3.1~v3.3 키 포함)
        results = self.main_window._last_results
        if not results:
            results = get_latest_results_per_pump()

        self._results_cache = {
            r.get("pump_id"): r for r in results}

        # v4.4: ACTION 카드 카운트 + 안정화 버퍼 + guidance
        action_keys = ["즉시점검", "교체계획", "예방정비", "정상"]
        action_counts = {k: 0 for k in action_keys}
        self._action_map = {}
        self._reason_map = {}      # pump_id -> reason
        self._guidance_map = {}    # pump_id -> guidance text
        self._stability_map = {}   # pump_id -> stability buffer result
        has_swd = False
        for r in results:
            if r.get("judgment") == "데이터없음":
                continue
            raw_cat, reason = classify_action_with_reason(r)
            pid = r.get("pump_id")
            # 안정화 버퍼 적용
            buf = apply_stability_buffer(pid, raw_cat)
            cat = buf["confirmed"]
            action_counts[cat] += 1
            self._action_map[pid] = cat
            self._reason_map[pid] = reason
            self._stability_map[pid] = buf
            self._guidance_map[pid] = get_action_guidance_text(
                cat, reason, r)
            if r.get("system_wide_drop"):
                has_swd = True

        for title, lbl in self._kpi_value_labels.items():
            lbl.setText(str(action_counts.get(title, 0)))

        # system_wide_drop 경고 박스
        self._swd_warning.setVisible(has_swd)

        # 카드 그리드 재구성
        self._rebuild_card_grid()

        # 선택된 펌프 상세 갱신
        if self._selected_pump_id:
            self._update_detail_panel(self._selected_pump_id)

        # 분석 로그 기록
        self._write_analysis_log(results)

    def _rebuild_card_grid(self):
        """카드 그리드 재구성 (2열) - ACTION 필터 적용."""
        results = list(self._results_cache.values())

        self.setUpdatesEnabled(False)
        try:
            while self.card_grid.count():
                item = self.card_grid.takeAt(0)
                w = item.widget()
                if w:
                    w.setParent(None)
                    w.deleteLater()
            self._card_widgets.clear()

            col_count = 2
            row, col = 0, 0
            for r in results:
                if r.get("judgment") == "데이터없음":
                    continue
                # v4.1: ACTION 카드 필터 적용
                if self._active_kpi_filter:
                    cat = self._action_map.get(r.get("pump_id"), "정상")
                    if cat != self._active_kpi_filter:
                        continue
                card = self._create_pump_card(r)
                self._card_widgets[r.get("pump_id")] = card
                self.card_grid.addWidget(card, row, col)
                col += 1
                if col >= col_count:
                    col = 0
                    row += 1
        finally:
            self.setUpdatesEnabled(True)


# ── 메인 윈도우 ─────────────────────────────────────────────
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("JAEWOO Pump Intelligence System")
        self.setMinimumSize(1100, 700)

        self.watcher = None
        self.worker = None
        self._last_results = []

        init_db()

        self._setup_ui()
        self._setup_watcher()

    def _setup_ui(self):
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)

        self.tab_dashboard = DashboardTab(self)
        self.tab_main = MainTab(self)
        self.tab_pump = PumpMasterTab(self)
        self.tab_casing = CasingHistoryTab(self)
        self.tab_results = AnalysisResultsTab(self)
        self.tab_settings = SettingsTab(self)

        self.tabs.addTab(self.tab_dashboard, "대시보드")
        self.tabs.addTab(self.tab_main, "메인")
        self.tabs.addTab(self.tab_pump, "펌프 마스터")
        self.tabs.addTab(self.tab_casing, "케이싱 이력")
        self.tabs.addTab(self.tab_results, "분석 결과")
        self.tabs.addTab(self.tab_settings, "설정")

        # 전문가 모드 토글
        toolbar = self.addToolBar("Tools")
        toolbar.setMovable(False)
        spacer = QWidget()
        spacer.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        toolbar.addWidget(spacer)
        self.expert_toggle = QPushButton("기본모드")
        self.expert_toggle.setCheckable(True)
        self.expert_toggle.setChecked(False)
        self.expert_toggle.setFixedWidth(100)
        self.expert_toggle.setStyleSheet(
            "QPushButton { padding: 4px 12px; border-radius: 12px; "
            "background: #E0E0E0; font-size: 9pt; }"
            "QPushButton:checked { background: #1565C0; color: white; }")
        self.expert_toggle.toggled.connect(self._on_expert_toggled)
        toolbar.addWidget(self.expert_toggle)

        self.statusBar().showMessage("준비")
        self.tabs.currentChanged.connect(self._on_tab_changed)

    def _on_expert_toggled(self, checked: bool):
        """전문가 모드 토글."""
        self._expert_mode = checked
        self.expert_toggle.setText("전문가모드" if checked else "기본모드")
        if hasattr(self.tab_dashboard, "set_expert_mode"):
            self.tab_dashboard.set_expert_mode(checked)

    def _on_tab_changed(self, index):
        widget = self.tabs.widget(index)
        if hasattr(widget, "refresh"):
            widget.refresh()

    def _setup_watcher(self):
        settings = load_settings()
        if settings.get("auto_watch_enabled", True):
            self.watcher = FolderWatcher(self._on_file_detected)
            self.watcher.start()
            self.statusBar().showMessage(f"폴더 감시 중: {INPUT_DIR}")

    def _on_file_detected(self, file_path: Path):
        logger.info(f"자동 감지된 파일: {file_path}")
        self.tab_main.run_analysis(str(file_path))

    def closeEvent(self, event):
        if self.watcher:
            self.watcher.stop()
        if self.worker and self.worker.isRunning():
            self.worker.quit()
            self.worker.wait(3000)
        event.accept()


# ── 메인 탭 ─────────────────────────────────────────────────
class MainTab(QWidget):
    def __init__(self, main_window: MainWindow):
        super().__init__()
        self.main_window = main_window
        self._report_saved_ok = False
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        # ── 상단: 파일 선택 및 실행 ──────────────────────
        top_group = QGroupBox("데이터 입력 및 분석")
        top_layout = QHBoxLayout()

        self.file_label = QLabel("파일을 선택하거나 input 폴더에 드롭하세요")
        self.file_label.setStyleSheet("color: #666; padding: 4px;")
        top_layout.addWidget(self.file_label, stretch=1)

        self.btn_browse = QPushButton("파일 선택")
        self.btn_browse.setFixedWidth(100)
        self.btn_browse.clicked.connect(self._browse_file)
        top_layout.addWidget(self.btn_browse)

        self.btn_run = QPushButton("분석 실행")
        self.btn_run.setFixedWidth(100)
        self.btn_run.setStyleSheet(
            "QPushButton { background-color: #2196F3; color: white; "
            "font-weight: bold; padding: 6px; border-radius: 4px; }"
            "QPushButton:hover { background-color: #1976D2; }"
            "QPushButton:disabled { background-color: #ccc; }"
        )
        self.btn_run.clicked.connect(lambda: self.run_analysis())
        top_layout.addWidget(self.btn_run)

        self.btn_reanalyze = QPushButton("재분석 (DB)")
        self.btn_reanalyze.setFixedWidth(100)
        self.btn_reanalyze.setToolTip("DB에 저장된 데이터로 재분석")
        self.btn_reanalyze.clicked.connect(self._reanalyze)
        top_layout.addWidget(self.btn_reanalyze)

        top_group.setLayout(top_layout)
        layout.addWidget(top_group)

        # 진행 상황
        self.progress = QProgressBar()
        self.progress.setRange(0, 0)
        self.progress.hide()
        layout.addWidget(self.progress)

        self.status_label = QLabel("")
        layout.addWidget(self.status_label)

        # ── 기간별 리포트 생성 ────────────────────────────
        report_group = QGroupBox("기간별 리포트 생성")
        report_vlayout = QVBoxLayout()

        # 데이터 보유 기간 표시
        self.data_range_label = QLabel("현재 데이터 보유 기간: 조회 중...")
        self.data_range_label.setStyleSheet(
            "color: #333; padding: 4px; font-weight: bold;")
        report_vlayout.addWidget(self.data_range_label)

        # 날짜 선택
        date_layout = QHBoxLayout()

        date_layout.addWidget(QLabel("시작일:"))
        self.date_start = QDateEdit()
        self.date_start.setCalendarPopup(True)
        self.date_start.setDisplayFormat("yyyy-MM-dd")
        self.date_start.dateChanged.connect(self._on_date_changed)
        date_layout.addWidget(self.date_start)

        date_layout.addWidget(QLabel("  종료일:"))
        self.date_end = QDateEdit()
        self.date_end.setCalendarPopup(True)
        self.date_end.setDisplayFormat("yyyy-MM-dd")
        self.date_end.dateChanged.connect(self._on_date_changed)
        date_layout.addWidget(self.date_end)

        self.btn_generate = QPushButton("리포트 생성")
        self.btn_generate.setFixedWidth(140)
        self.btn_generate.setStyleSheet(
            "QPushButton { background-color: #FF9800; color: white; "
            "font-weight: bold; padding: 6px; border-radius: 4px; }"
            "QPushButton:hover { background-color: #F57C00; }"
            "QPushButton:disabled { background-color: #ccc; }"
        )
        self.btn_generate.clicked.connect(self._run_report_generation)
        date_layout.addWidget(self.btn_generate)

        self.btn_open_folder = QPushButton("리포트 폴더 열기")
        self.btn_open_folder.setFixedWidth(120)
        self.btn_open_folder.clicked.connect(self._open_report_folder)
        date_layout.addWidget(self.btn_open_folder)

        self.chk_auto_open = QCheckBox("생성 후 자동 열기")
        date_layout.addWidget(self.chk_auto_open)

        date_layout.addStretch()
        report_vlayout.addLayout(date_layout)

        # 생성 계획 미리보기
        self.plan_label = QLabel("")
        self.plan_label.setStyleSheet("color: #006600; padding: 4px;")
        report_vlayout.addWidget(self.plan_label)

        report_group.setLayout(report_vlayout)
        layout.addWidget(report_group)

        # ── 로그 출력 ──────────────────────────────────────
        log_group = QGroupBox("로그")
        log_layout = QVBoxLayout()
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setMaximumHeight(200)
        self.log_text.setFont(QFont("Consolas", 9))
        log_layout.addWidget(self.log_text)
        log_group.setLayout(log_layout)
        layout.addWidget(log_group)

        # ── 최근 분석 요약 ─────────────────────────────────
        result_group = QGroupBox("최근 분석 요약")
        result_layout = QVBoxLayout()
        self.result_table = QTableWidget()
        self.result_table.setColumnCount(7)
        self.result_table.setHorizontalHeaderLabels(
            ["펌프ID", "평균유량", "기준선대비(%)", "데이터확보율(%)",
             "가동패턴", "판정", "분석일"])
        self.result_table.horizontalHeader().setSectionResizeMode(
            QHeaderView.Stretch)
        self.result_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.result_table.setAlternatingRowColors(True)
        result_layout.addWidget(self.result_table)
        result_group.setLayout(result_layout)
        layout.addWidget(result_group)

        # 초기 데이터 로드
        self._refresh_date_range()

    # ── 파일 분석 ─────────────────────────────────────────
    def _browse_file(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "데이터 파일 선택", str(INPUT_DIR),
            "Excel/HTML Files (*.xls *.xlsx *.html *.htm);;All Files (*)")
        if path:
            self.file_label.setText(path)

    def run_analysis(self, file_path: str = None):
        if self.main_window.worker and self.main_window.worker.isRunning():
            self._log("이전 분석이 실행 중입니다.")
            return

        if not file_path:
            label_text = self.file_label.text()
            if label_text and Path(label_text).exists():
                file_path = label_text
            else:
                file_path = None

        self.progress.show()
        self.btn_run.setEnabled(False)
        self._log(f"분석 시작"
                  f"{' - ' + Path(file_path).name if file_path else ' (DB 데이터)'}")

        worker = AnalysisWorker(file_path)
        worker.progress.connect(self._on_progress)
        worker.finished.connect(self._on_analysis_finished)
        worker.error.connect(self._on_analysis_error)
        self.main_window.worker = worker
        if not callable(worker.start):
            raise RuntimeError("Worker start() is not callable")
        worker.start()

    def _reanalyze(self):
        self.run_analysis(None)

    def _on_progress(self, msg: str):
        self.status_label.setText(msg)
        self._log(msg)

    def _on_analysis_finished(self, results: list[dict]):
        self.progress.hide()
        self.btn_run.setEnabled(True)
        self.status_label.setText("분석 완료!")
        self.main_window._last_results = results
        self._update_result_table(results)

        report = results[0].get("report_path", "") if results else ""
        saved_ok = results[0].get("_report_saved_ok", False) if results else False
        self._log(f"분석 완료: {len(results)}개 펌프")
        if report:
            self._log(f"리포트 저장: {report}")
            if not saved_ok:
                self._log("(주의: 저장 경로가 잠겨 대체 경로에 저장됨)")
        self.main_window.statusBar().showMessage("분석 완료")
        self._refresh_date_range()

    def _on_analysis_error(self, msg: str):
        self.progress.hide()
        self.btn_run.setEnabled(True)
        self.status_label.setText(f"오류: {msg}")
        self._log(f"오류: {msg}")
        QMessageBox.warning(self, "분석 오류", msg)

    def _update_result_table(self, results: list[dict]):
        self.result_table.setRowCount(len(results))
        for i, r in enumerate(results):
            self.result_table.setItem(i, 0, QTableWidgetItem(
                r.get("pump_id", "")))
            self.result_table.setItem(i, 1, QTableWidgetItem(
                f"{r.get('avg_flow', 'N/A')}"
                if r.get("avg_flow") is not None else "N/A"))
            self.result_table.setItem(i, 2, QTableWidgetItem(
                f"{r.get('degradation_pct', 'N/A')}"
                if r.get("degradation_pct") is not None else "N/A"))
            dr = r.get("data_rate")
            self.result_table.setItem(i, 3, QTableWidgetItem(
                f"{dr:.1f}" if dr is not None else "N/A"))

            self.result_table.setItem(i, 4, QTableWidgetItem(
                r.get("timer_mode", "")))

            judgment = r.get("judgment", "")
            j_item = QTableWidgetItem(judgment)
            if "정밀점검" in judgment:
                j_item.setBackground(QColor("#FF4444"))
                j_item.setForeground(QColor("white"))
            elif "점검권장" in judgment:
                j_item.setBackground(QColor("#FFA500"))
            elif "경과관찰" in judgment:
                j_item.setBackground(QColor("#FFFF00"))
            elif "정상" in judgment:
                j_item.setBackground(QColor("#90EE90"))
            elif "데이터부족" in judgment or "데이터없음" in judgment:
                j_item.setBackground(QColor("#D3D3D3"))
            self.result_table.setItem(i, 5, j_item)

            self.result_table.setItem(i, 6, QTableWidgetItem(
                r.get("analysis_date", "")))

    # ── 기간별 리포트 생성 ─────────────────────────────────
    def _refresh_date_range(self):
        """DB 데이터 범위 조회 → 날짜 선택기 범위 설정."""
        date_range = get_data_date_range()
        if date_range:
            min_d, max_d = date_range
            d1 = datetime.strptime(min_d, "%Y-%m-%d")
            d2 = datetime.strptime(max_d, "%Y-%m-%d")
            days = (d2 - d1).days + 1
            self.data_range_label.setText(
                f"현재 데이터 보유 기간: {min_d} ~ {max_d} (총 {days}일)")

            q_min = QDate.fromString(min_d, "yyyy-MM-dd")
            q_max = QDate.fromString(max_d, "yyyy-MM-dd")

            self.date_start.blockSignals(True)
            self.date_end.blockSignals(True)

            self.date_start.setDateRange(q_min, q_max)
            self.date_end.setDateRange(q_min, q_max)
            self.date_start.setDate(q_min)
            self.date_end.setDate(q_max)

            self.date_start.blockSignals(False)
            self.date_end.blockSignals(False)

            self._on_date_changed()
        else:
            self.data_range_label.setText(
                "현재 데이터 보유 기간: 데이터 없음")
            self.btn_generate.setEnabled(False)
            self.plan_label.setText(
                "데이터가 없어 리포트를 생성할 수 없습니다.")
            self.plan_label.setStyleSheet("color: red; padding: 4px;")

    def _on_date_changed(self):
        """날짜 변경 시 생성 계획 업데이트."""
        start = self.date_start.date().toString("yyyy-MM-dd")
        end = self.date_end.date().toString("yyyy-MM-dd")

        if start > end:
            self.btn_generate.setEnabled(False)
            self.plan_label.setText("시작일이 종료일보다 클 수 없습니다.")
            self.plan_label.setStyleSheet("color: red; padding: 4px;")
            return

        plan = generate_report_plan(start, end)

        if not plan["report_types"]:
            self.btn_generate.setEnabled(False)
            # 기간이 7일 미만이면 기간 부족, 그 외는 데이터 없음
            from src.period import get_report_types
            candidate_types = get_report_types(start, end)
            if not candidate_types:
                self.plan_label.setText(
                    f"선택 기간: {plan['total_days']}일 (최소 7일 이상 필요)")
            else:
                self.plan_label.setText(
                    f"선택 기간: {plan['total_days']}일 → "
                    f"생성 가능한 리포트 없음 (데이터 없음)")
            self.plan_label.setStyleSheet("color: red; padding: 4px;")
            return

        self.btn_generate.setEnabled(True)
        parts = []
        for rt in plan["report_types"]:
            kr = PERIOD_TYPE_KR[rt]
            parts.append(f"{kr} {plan['counts'][rt]}개")
        plan_text = (
            f"선택 기간: {plan['total_days']}일 → "
            f"생성: {', '.join(parts)}")
        self.plan_label.setText(plan_text)
        self.plan_label.setStyleSheet("color: #006600; padding: 4px;")

    def _run_report_generation(self):
        """리포트 생성 시작."""
        if self.main_window.worker and self.main_window.worker.isRunning():
            self._log("이전 작업이 실행 중입니다.")
            return

        settings = load_settings()
        site = settings.get("site_name", "안평리")
        start = self.date_start.date().toString("yyyy-MM-dd")
        end = self.date_end.date().toString("yyyy-MM-dd")

        self.progress.show()
        self.btn_generate.setEnabled(False)
        self._report_saved_ok = False
        self._log(f"리포트 생성 시작: {start} ~ {end}")

        worker = ReportWorker(site, start, end)
        worker.progress.connect(self._on_progress)
        worker.finished.connect(self._on_report_finished)
        worker.error.connect(self._on_report_error)
        self.main_window.worker = worker
        if not callable(worker.start):
            raise RuntimeError("Worker start() is not callable")
        worker.start()

    def _on_report_finished(self, results: list[dict]):
        self.progress.hide()
        self.btn_generate.setEnabled(True)

        if not results:
            self.status_label.setText("생성 가능한 리포트 없음 (데이터 없음)")
            self._log("생성 가능한 리포트가 없습니다. 선택 기간에 데이터가 존재하지 않습니다.")
            self._report_saved_ok = False
            self.main_window.statusBar().showMessage("리포트 없음")
            return

        ok_count = sum(1 for r in results if r["saved_ok"])
        fail_count = len(results) - ok_count

        # 유형별 집계
        type_counts = {}
        for r in results:
            kr = r.get("period_type_kr", "?")
            if kr not in type_counts:
                type_counts[kr] = {"ok": 0, "fail": 0}
            if r["saved_ok"]:
                type_counts[kr]["ok"] += 1
            else:
                type_counts[kr]["fail"] += 1

        self.status_label.setText(
            f"리포트 {ok_count}개 생성 완료!")

        self._log(f"리포트 생성 완료: 총 {ok_count}개 성공, {fail_count}개 실패")
        for kr, counts in type_counts.items():
            self._log(f"  {kr}: {counts['ok']}개 생성"
                      + (f" ({counts['fail']}개 실패)" if counts['fail'] else ""))

        for r in results:
            status = "저장" if r["saved_ok"] else "실패"
            self._log(f"  [{status}] {r['label']} → {r['path']}")

        self._report_saved_ok = (ok_count > 0)
        self.main_window.statusBar().showMessage("리포트 생성 완료")

        # 자동 폴더 열기
        if self.chk_auto_open.isChecked() and ok_count > 0:
            self._open_report_folder()

    def _on_report_error(self, msg: str):
        self.progress.hide()
        self.btn_generate.setEnabled(True)
        self._report_saved_ok = False
        self.status_label.setText(f"리포트 오류: {msg}")
        self._log(f"리포트 오류: {msg}")
        QMessageBox.warning(self, "리포트 생성 오류", msg)

    def _open_report_folder(self):
        """리포트 폴더 열기."""
        folder = str(REPORTS_DIR)
        try:
            subprocess.Popen(f'explorer "{folder}"')
        except Exception:
            try:
                os.startfile(folder)
            except Exception:
                QMessageBox.warning(
                    self, "폴더 열기 실패",
                    f"폴더를 열 수 없습니다: {folder}")

    def _log(self, msg: str):
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_text.append(f"[{ts}] {msg}")

    def refresh(self):
        self._refresh_date_range()


# ── 펌프 마스터 탭 ──────────────────────────────────────────
class PumpMasterTab(QWidget):
    def __init__(self, main_window: MainWindow):
        super().__init__()
        self.main_window = main_window
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        form_group = QGroupBox("펌프 정보 입력/수정")
        form_layout = QFormLayout()

        self.inp_id = QLineEdit()
        self.inp_id.setPlaceholderText("예: PUMP_001")
        form_layout.addRow("펌프 ID:", self.inp_id)

        self.inp_name = QLineEdit()
        self.inp_name.setPlaceholderText("예: 1호 관정")
        form_layout.addRow("펌프명:", self.inp_name)

        self.inp_location = QLineEdit()
        self.inp_location.setPlaceholderText("예: A동 지하1층")
        form_layout.addRow("위치:", self.inp_location)

        self.inp_capacity = QDoubleSpinBox()
        self.inp_capacity.setRange(0, 99999)
        self.inp_capacity.setDecimals(1)
        self.inp_capacity.setSuffix(" m\u00b3/h")
        form_layout.addRow("설계용량:", self.inp_capacity)

        self.inp_install = QDateEdit()
        self.inp_install.setCalendarPopup(True)
        self.inp_install.setDate(QDate.currentDate())
        form_layout.addRow("설치일:", self.inp_install)

        self.inp_cycle = QSpinBox()
        self.inp_cycle.setRange(1, 9999)
        self.inp_cycle.setValue(365)
        self.inp_cycle.setSuffix(" 일")
        form_layout.addRow("목표점검주기:", self.inp_cycle)

        self.inp_memo = QLineEdit()
        form_layout.addRow("메모:", self.inp_memo)

        self.inp_model = QLineEdit()
        self.inp_model.setPlaceholderText("예: SP-125, KSB 100-200")
        form_layout.addRow("모델:", self.inp_model)

        self.inp_rated_flow = QDoubleSpinBox()
        self.inp_rated_flow.setRange(0, 99999)
        self.inp_rated_flow.setDecimals(1)
        self.inp_rated_flow.setSuffix(" m\u00b3/h")
        form_layout.addRow("정격유량:", self.inp_rated_flow)

        # 타이머 감지 설정
        self.inp_on_threshold = QDoubleSpinBox()
        self.inp_on_threshold.setRange(0, 99999)
        self.inp_on_threshold.setDecimals(2)
        self.inp_on_threshold.setSuffix(" m\u00b3/h")
        self.inp_on_threshold.setToolTip("0이면 전역 설정(0.1) 사용")
        form_layout.addRow("ON 임계값 (0=전역설정):", self.inp_on_threshold)

        self.inp_repeat_window = QSpinBox()
        self.inp_repeat_window.setRange(1, 120)
        self.inp_repeat_window.setValue(30)
        self.inp_repeat_window.setSuffix(" 분")
        form_layout.addRow("반복 판정 허용범위:", self.inp_repeat_window)

        self.inp_repeat_min_days = QSpinBox()
        self.inp_repeat_min_days.setRange(1, 30)
        self.inp_repeat_min_days.setValue(3)
        self.inp_repeat_min_days.setSuffix(" 일")
        form_layout.addRow("반복 최소 일수:", self.inp_repeat_min_days)

        self.inp_duty_max = QDoubleSpinBox()
        self.inp_duty_max.setRange(0, 1)
        self.inp_duty_max.setDecimals(2)
        self.inp_duty_max.setSingleStep(0.05)
        self.inp_duty_max.setValue(0.75)
        form_layout.addRow("타이머 최대 가동률:", self.inp_duty_max)

        btn_layout = QHBoxLayout()
        self.btn_save = QPushButton("저장")
        self.btn_save.clicked.connect(self._save_pump)
        self.btn_save.setStyleSheet(
            "QPushButton { background-color: #4CAF50; color: white; "
            "padding: 6px 16px; border-radius: 4px; }")
        btn_layout.addWidget(self.btn_save)

        self.btn_delete = QPushButton("삭제")
        self.btn_delete.clicked.connect(self._delete_pump)
        self.btn_delete.setStyleSheet(
            "QPushButton { background-color: #f44336; color: white; "
            "padding: 6px 16px; border-radius: 4px; }")
        btn_layout.addWidget(self.btn_delete)

        self.btn_clear = QPushButton("초기화")
        self.btn_clear.clicked.connect(self._clear_form)
        btn_layout.addWidget(self.btn_clear)
        btn_layout.addStretch()

        form_layout.addRow("", btn_layout)
        form_group.setLayout(form_layout)
        layout.addWidget(form_group)

        list_group = QGroupBox("등록된 펌프 목록")
        list_layout = QVBoxLayout()

        self.table = QTableWidget()
        self.table.setColumnCount(13)
        self.table.setHorizontalHeaderLabels(
            ["펌프ID", "펌프명", "위치", "설계용량", "설치일",
             "점검주기(일)", "메모", "모델", "정격유량",
             "ON임계값", "반복범위(분)", "반복최소일수", "최대가동률"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setAlternatingRowColors(True)
        self.table.doubleClicked.connect(self._on_row_double_click)

        list_layout.addWidget(self.table)
        list_group.setLayout(list_layout)
        layout.addWidget(list_group)

    def refresh(self):
        pumps = get_all_pumps()
        self.table.setRowCount(len(pumps))
        for i, p in enumerate(pumps):
            self.table.setItem(i, 0, QTableWidgetItem(p["pump_id"]))
            self.table.setItem(i, 1, QTableWidgetItem(p["pump_name"]))
            self.table.setItem(i, 2, QTableWidgetItem(p.get("location", "")))
            self.table.setItem(i, 3, QTableWidgetItem(
                str(p.get("capacity_m3h", 0))))
            self.table.setItem(i, 4, QTableWidgetItem(
                p.get("install_date", "")))
            self.table.setItem(i, 5, QTableWidgetItem(
                str(p.get("inspect_cycle_days", 365))))
            self.table.setItem(i, 6, QTableWidgetItem(p.get("memo", "")))
            self.table.setItem(i, 7, QTableWidgetItem(
                p.get("model", "")))
            self.table.setItem(i, 8, QTableWidgetItem(
                str(p.get("rated_flow", 0))))
            self.table.setItem(i, 9, QTableWidgetItem(
                str(p.get("on_threshold", 0))))
            self.table.setItem(i, 10, QTableWidgetItem(
                str(p.get("timer_repeat_window_minutes", 30))))
            self.table.setItem(i, 11, QTableWidgetItem(
                str(p.get("timer_repeat_min_days", 3))))
            self.table.setItem(i, 12, QTableWidgetItem(
                str(p.get("duty_cycle_timer_max", 0.75))))

    def _save_pump(self):
        pid = self.inp_id.text().strip()
        name = self.inp_name.text().strip()
        if not pid or not name:
            QMessageBox.warning(self, "입력 오류",
                                "펌프 ID와 펌프명은 필수입니다.")
            return
        upsert_pump(
            pump_id=pid, pump_name=name,
            location=self.inp_location.text().strip(),
            capacity=self.inp_capacity.value(),
            install_date=self.inp_install.date().toString("yyyy-MM-dd"),
            inspect_cycle=self.inp_cycle.value(),
            memo=self.inp_memo.text().strip(),
            on_threshold=self.inp_on_threshold.value(),
            timer_repeat_window_minutes=self.inp_repeat_window.value(),
            timer_repeat_min_days=self.inp_repeat_min_days.value(),
            duty_cycle_timer_max=self.inp_duty_max.value(),
            model=self.inp_model.text().strip(),
            rated_flow=self.inp_rated_flow.value(),
        )
        self._log(f"펌프 저장: {pid}")
        self.refresh()
        self._clear_form()

    def _delete_pump(self):
        pid = self.inp_id.text().strip()
        if not pid:
            QMessageBox.warning(self, "선택 오류",
                                "삭제할 펌프 ID를 입력하세요.")
            return
        reply = QMessageBox.question(
            self, "삭제 확인",
            f"펌프 '{pid}'와 모든 관련 데이터를 삭제하시겠습니까?",
            QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            delete_pump(pid)
            self._log(f"펌프 삭제: {pid}")
            self.refresh()
            self._clear_form()

    def _clear_form(self):
        self.inp_id.clear()
        self.inp_name.clear()
        self.inp_location.clear()
        self.inp_capacity.setValue(0)
        self.inp_install.setDate(QDate.currentDate())
        self.inp_cycle.setValue(365)
        self.inp_memo.clear()
        self.inp_model.clear()
        self.inp_rated_flow.setValue(0)
        self.inp_on_threshold.setValue(0)
        self.inp_repeat_window.setValue(30)
        self.inp_repeat_min_days.setValue(3)
        self.inp_duty_max.setValue(0.75)

    def _on_row_double_click(self, index):
        row = index.row()
        self.inp_id.setText(self.table.item(row, 0).text())
        self.inp_name.setText(self.table.item(row, 1).text())
        self.inp_location.setText(self.table.item(row, 2).text())
        try:
            self.inp_capacity.setValue(float(self.table.item(row, 3).text()))
        except ValueError:
            pass
        date_str = self.table.item(row, 4).text()
        if date_str:
            self.inp_install.setDate(
                QDate.fromString(date_str, "yyyy-MM-dd"))
        try:
            self.inp_cycle.setValue(int(self.table.item(row, 5).text()))
        except ValueError:
            pass
        self.inp_memo.setText(self.table.item(row, 6).text())
        self.inp_model.setText(self.table.item(row, 7).text() or "")
        try:
            self.inp_rated_flow.setValue(
                float(self.table.item(row, 8).text()))
        except (ValueError, AttributeError):
            self.inp_rated_flow.setValue(0)
        try:
            self.inp_on_threshold.setValue(
                float(self.table.item(row, 9).text()))
        except (ValueError, AttributeError):
            self.inp_on_threshold.setValue(0)
        try:
            self.inp_repeat_window.setValue(
                int(self.table.item(row, 10).text()))
        except (ValueError, AttributeError):
            self.inp_repeat_window.setValue(30)
        try:
            self.inp_repeat_min_days.setValue(
                int(self.table.item(row, 11).text()))
        except (ValueError, AttributeError):
            self.inp_repeat_min_days.setValue(3)
        try:
            self.inp_duty_max.setValue(
                float(self.table.item(row, 12).text()))
        except (ValueError, AttributeError):
            self.inp_duty_max.setValue(0.75)

    def _log(self, msg):
        self.main_window.tab_main._log(msg)


# ── 케이싱 이력 탭 ──────────────────────────────────────────
class CasingHistoryTab(QWidget):
    def __init__(self, main_window: MainWindow):
        super().__init__()
        self.main_window = main_window
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        form_group = QGroupBox("정비 이벤트 등록")
        form_layout = QFormLayout()

        self.inp_pump = QComboBox()
        self.inp_pump.setEditable(True)
        form_layout.addRow("펌프 ID:", self.inp_pump)

        # v4.1: 이벤트 유형 선택
        self.inp_event_type = QComboBox()
        self.inp_event_type.addItems([
            "케이싱 교체", "펌프교체", "수리", "예방정비"
        ])
        self.inp_event_type.currentIndexChanged.connect(
            self._on_event_type_changed)
        form_layout.addRow("이벤트 유형:", self.inp_event_type)

        self.inp_date = QDateEdit()
        self.inp_date.setCalendarPopup(True)
        self.inp_date.setDate(QDate.currentDate())
        form_layout.addRow("일자:", self.inp_date)

        self.inp_reason = QLineEdit()
        self.inp_reason.setPlaceholderText("예: 노후 교체, 파손 교체, 예방 점검")
        form_layout.addRow("사유:", self.inp_reason)

        self.inp_reset = QCheckBox("기준선 초기화 (교체 후 새 기준선 설정)")
        self.inp_reset.setChecked(True)
        form_layout.addRow("", self.inp_reset)

        self.inp_memo = QLineEdit()
        form_layout.addRow("메모:", self.inp_memo)

        btn_layout = QHBoxLayout()
        self.btn_add = QPushButton("등록")
        self.btn_add.clicked.connect(self._add_event)
        self.btn_add.setStyleSheet(
            "QPushButton { background-color: #4CAF50; color: white; "
            "padding: 6px 16px; border-radius: 4px; }")
        btn_layout.addWidget(self.btn_add)

        self.btn_delete = QPushButton("선택 삭제")
        self.btn_delete.clicked.connect(self._delete_event)
        self.btn_delete.setStyleSheet(
            "QPushButton { background-color: #f44336; color: white; "
            "padding: 6px 16px; border-radius: 4px; }")
        btn_layout.addWidget(self.btn_delete)
        btn_layout.addStretch()

        form_layout.addRow("", btn_layout)
        form_group.setLayout(form_layout)
        layout.addWidget(form_group)

        list_group = QGroupBox("정비 이벤트 이력")
        list_layout = QVBoxLayout()

        filter_layout = QHBoxLayout()
        filter_layout.addWidget(QLabel("펌프 필터:"))
        self.filter_pump = QComboBox()
        self.filter_pump.addItem("전체")
        self.filter_pump.currentTextChanged.connect(lambda _: self.refresh())
        filter_layout.addWidget(self.filter_pump)
        filter_layout.addStretch()
        list_layout.addLayout(filter_layout)

        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels(
            ["ID", "펌프ID", "이벤트유형", "일자", "사유",
             "기준선초기화", "메모"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setAlternatingRowColors(True)
        list_layout.addWidget(self.table)

        list_group.setLayout(list_layout)
        layout.addWidget(list_group)

    def refresh(self):
        pumps = get_all_pumps()
        pump_ids = [p["pump_id"] for p in pumps]

        self.inp_pump.clear()
        self.inp_pump.addItems(pump_ids)

        current_filter = self.filter_pump.currentText()
        self.filter_pump.clear()
        self.filter_pump.addItem("전체")
        self.filter_pump.addItems(pump_ids)
        if current_filter in pump_ids:
            self.filter_pump.setCurrentText(current_filter)

        filter_id = self.filter_pump.currentText()
        if filter_id == "전체":
            events = get_casing_history()
        else:
            events = get_casing_history(filter_id)

        self.table.setRowCount(len(events))
        for i, ev in enumerate(events):
            self.table.setItem(i, 0, QTableWidgetItem(str(ev["id"])))
            self.table.setItem(i, 1, QTableWidgetItem(ev["pump_id"]))
            # v4.1: 이벤트 유형 한국어 표시
            evt_type = ev.get("event_type", "casing")
            evt_kr = {"casing": "케이싱 교체",
                      "pump_replacement": "펌프교체",
                      "repair": "수리",
                      "preventive_maintenance": "예방정비"
                      }.get(evt_type, evt_type)
            self.table.setItem(i, 2, QTableWidgetItem(evt_kr))
            self.table.setItem(i, 3, QTableWidgetItem(ev["change_date"]))
            self.table.setItem(i, 4, QTableWidgetItem(ev.get("reason", "")))
            self.table.setItem(i, 5, QTableWidgetItem(
                "예" if ev.get("reset_baseline") else "아니오"))
            self.table.setItem(i, 6, QTableWidgetItem(ev.get("memo", "")))

    # v4.1: 이벤트 유형 매핑
    EVENT_TYPE_MAP = {
        "케이싱 교체": "casing",
        "펌프교체": "pump_replacement",
        "수리": "repair",
        "예방정비": "preventive_maintenance",
    }
    RESET_EVENT_TYPES = {"casing", "pump_replacement"}

    def _on_event_type_changed(self, index: int):
        """이벤트 유형 변경 시 기준선 초기화 체크박스 자동 설정."""
        selected = self.inp_event_type.currentText()
        db_type = self.EVENT_TYPE_MAP.get(selected, "casing")
        should_reset = db_type in self.RESET_EVENT_TYPES
        self.inp_reset.setChecked(should_reset)
        self.inp_reset.setEnabled(should_reset)

    def _add_event(self):
        pid = self.inp_pump.currentText().strip()
        if not pid:
            QMessageBox.warning(self, "입력 오류", "펌프 ID를 선택하세요.")
            return
        selected_type = self.inp_event_type.currentText()
        db_event_type = self.EVENT_TYPE_MAP.get(selected_type, "casing")
        reset = (1 if self.inp_reset.isChecked()
                 and db_event_type in self.RESET_EVENT_TYPES
                 else 0)
        add_casing_event(
            pump_id=pid,
            change_date=self.inp_date.date().toString("yyyy-MM-dd"),
            reason=self.inp_reason.text().strip(),
            reset_baseline=reset,
            memo=self.inp_memo.text().strip(),
            event_type=db_event_type,
        )
        self._log(f"이벤트 등록: {pid} ({selected_type})")
        self.refresh()

    def _delete_event(self):
        row = self.table.currentRow()
        if row < 0:
            QMessageBox.warning(self, "선택 오류", "삭제할 항목을 선택하세요.")
            return
        eid = int(self.table.item(row, 0).text())
        reply = QMessageBox.question(
            self, "삭제 확인", "선택한 케이싱 교체 이력을 삭제하시겠습니까?",
            QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            delete_casing_event(eid)
            self.refresh()

    def _log(self, msg):
        self.main_window.tab_main._log(msg)


# ── 분석 결과 탭 (v2.0 재설계) ────────────────────────────
class AnalysisResultsTab(QWidget):
    """분석 결과: 필터 + 간소화 7컬럼 테이블 + 더블클릭 상세 팝업."""

    def __init__(self, main_window: MainWindow):
        super().__init__()
        self.main_window = main_window
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        # ── 상단 필터 바 ───────────────────────────────
        filter_layout = QHBoxLayout()

        filter_layout.addWidget(QLabel("기간유형:"))
        self.filter_period_type = QComboBox()
        self.filter_period_type.addItems(
            ["전체", "주간", "월간", "분기", "연간"])
        self.filter_period_type.currentTextChanged.connect(
            lambda _: self.refresh())
        filter_layout.addWidget(self.filter_period_type)

        filter_layout.addWidget(QLabel("펌프:"))
        self.filter_pump = QComboBox()
        self.filter_pump.addItem("전체")
        self.filter_pump.currentTextChanged.connect(
            lambda _: self.refresh())
        filter_layout.addWidget(self.filter_pump)

        filter_layout.addWidget(QLabel("판정:"))
        self.filter_status = QComboBox()
        self.filter_status.addItems(
            ["전체", "정상", "경과관찰", "점검권장", "정밀점검", "데이터부족"])
        self.filter_status.currentTextChanged.connect(
            lambda _: self.refresh())
        filter_layout.addWidget(self.filter_status)

        filter_layout.addStretch()

        self.btn_open_report = QPushButton("리포트 폴더 열기")
        self.btn_open_report.clicked.connect(self._open_report_folder)
        filter_layout.addWidget(self.btn_open_report)
        layout.addLayout(filter_layout)

        # ── 9컬럼 테이블 (v3.4) ──────────────────────
        self.table = QTableWidget()
        self.table.setColumnCount(9)
        self.table.setHorizontalHeaderLabels([
            "펌프", "역할", "분석기간", "평균유량", "기준",
            "하락률", "가동시간", "판정", "상세",
        ])
        self.table.horizontalHeader().setSectionResizeMode(
            QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(
            8, QHeaderView.ResizeToContents)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setAlternatingRowColors(True)
        self.table.doubleClicked.connect(self._on_row_double_click)
        layout.addWidget(self.table)

    def refresh(self):
        pumps = get_all_pumps()
        pump_ids = [p["pump_id"] for p in pumps]
        current = self.filter_pump.currentText()
        self.filter_pump.blockSignals(True)
        self.filter_pump.clear()
        self.filter_pump.addItem("전체")
        self.filter_pump.addItems(pump_ids)
        if current in pump_ids:
            self.filter_pump.setCurrentText(current)
        self.filter_pump.blockSignals(False)

        # 필터 파라미터 수집
        pump_id = None
        pump_text = self.filter_pump.currentText()
        if pump_text != "전체":
            pump_id = pump_text

        judgment_filter = None
        status_text = self.filter_status.currentText()
        if status_text != "전체":
            judgment_filter = status_text

        results = get_analysis_results_filtered(
            pump_id=pump_id,
            judgment_filter=judgment_filter,
            limit=200,
        )

        # 기간유형 클라이언트 필터
        period_kr = self.filter_period_type.currentText()
        if period_kr != "전체":
            results = self._filter_by_period_type(results, period_kr)

        # 데이터 없는 기간 표시 금지
        results = [r for r in results if r.get("avg_flow") is not None]

        self.table.setRowCount(len(results))
        for i, r in enumerate(results):
            pump_id = r.get("pump_id", "")
            item_pump = QTableWidgetItem(pump_id)
            item_pump.setData(Qt.UserRole, r)
            self.table.setItem(i, 0, item_pump)

            # 역할
            p_info = get_pump_info(pump_id)
            op_type = ""
            if p_info:
                op_type = (p_info.get("operation_type_manual")
                           or p_info.get("operation_type_auto") or "")
            role_kr = OPERATION_TYPE_KR.get(op_type, "-")
            self.table.setItem(i, 1, QTableWidgetItem(role_kr))

            # 분석기간
            ps = r.get("period_start", "")
            pe = r.get("period_end", "")
            period_str = f"{ps} ~ {pe}" if ps and pe else "-"
            item_period = QTableWidgetItem(period_str)
            item_period.setFont(QFont(FONT_MONO, 8))
            self.table.setItem(i, 2, item_period)

            # 평균유량
            avg = r.get("avg_flow")
            item_avg = QTableWidgetItem(
                f"{avg:.2f}" if avg is not None else "-")
            item_avg.setFont(QFont(FONT_MONO, 9))
            self.table.setItem(i, 3, item_avg)

            # 기준
            bl = r.get("baseline_value")
            item_bl = QTableWidgetItem(
                f"{bl:.2f}" if bl is not None else "-")
            item_bl.setFont(QFont(FONT_MONO, 9))
            self.table.setItem(i, 4, item_bl)

            # 하락률
            deg = r.get("degradation_pct")
            item_deg = QTableWidgetItem(
                f"{deg:+.1f}%" if deg is not None else "-")
            item_deg.setFont(QFont(FONT_MONO, 9))
            if deg is not None and deg < -10:
                item_deg.setForeground(QColor("#C62828"))
            elif deg is not None and deg < -5:
                item_deg.setForeground(QColor("#EF6C00"))
            self.table.setItem(i, 5, item_deg)

            # 가동시간
            on_min = r.get("avg_on_minutes_per_day")
            self.table.setItem(i, 6, QTableWidgetItem(
                f"{on_min:.0f}분/일" if on_min is not None else "-"))

            # 판정
            judgment = r.get("judgment", "")
            j_item = QTableWidgetItem(judgment)
            j_colors = JUDGMENT_CARD_COLORS.get("데이터부족")
            for key, c in JUDGMENT_CARD_COLORS.items():
                if key in judgment:
                    j_colors = c
                    break
            if j_colors:
                j_item.setBackground(QColor(j_colors.get("bg", "#FFFFFF")))
                j_item.setForeground(QColor(j_colors.get("text", "#000000")))
            self.table.setItem(i, 7, j_item)

            # 상세보기 버튼
            btn = QPushButton("상세보기")
            btn.setFixedHeight(24)
            btn.setStyleSheet(
                "QPushButton { background: #2196F3; color: white; "
                "border-radius: 3px; padding: 2px 8px; font-size: 8pt; }"
                "QPushButton:hover { background: #1976D2; }")
            btn.clicked.connect(
                lambda checked, res=r: self._show_detail_popup(res))
            self.table.setCellWidget(i, 8, btn)

    @staticmethod
    def _filter_by_period_type(results: list[dict],
                               period_kr: str) -> list[dict]:
        """기간유형별 필터 (기간 길이 기반 추정)."""
        from datetime import datetime as dt
        kr_to_range = {
            "주간": (5, 9),
            "월간": (25, 35),
            "분기": (85, 100),
            "연간": (360, 370),
        }
        lo, hi = kr_to_range.get(period_kr, (0, 99999))
        filtered = []
        for r in results:
            ps = r.get("period_start", "")
            pe = r.get("period_end", "")
            if ps and pe:
                try:
                    days = (dt.strptime(pe, "%Y-%m-%d")
                            - dt.strptime(ps, "%Y-%m-%d")).days + 1
                    if lo <= days <= hi:
                        filtered.append(r)
                except ValueError:
                    pass
        return filtered

    def _on_row_double_click(self, index):
        """더블클릭 시 상세 팝업."""
        row = index.row()
        item = self.table.item(row, 0)
        if not item:
            return
        result = item.data(Qt.UserRole)
        if result:
            self._show_detail_popup(result)

    def _show_detail_popup(self, result: dict):
        """분석 상세 팝업 — 3구역 구조(요약+비교+근거) + 원본접기."""
        pump_id = result.get("pump_id", "")
        pump_name = result.get("pump_name", pump_id)
        judgment = result.get("judgment", "")

        dlg = QDialog(self)
        dlg.setWindowTitle(f"분석 상세 - {pump_name}")
        dlg.setMinimumSize(680, 600)

        layout = QVBoxLayout(dlg)
        layout.setSpacing(10)

        # ── (A) 요약 헤더 ─────────────────────────────
        header = QHBoxLayout()
        lbl_name = QLabel(str(pump_name))
        lbl_name.setFont(QFont(FONT_FAMILY, 14, QFont.Bold))
        header.addWidget(lbl_name)

        if judgment:
            j_colors = JUDGMENT_CARD_COLORS.get("데이터부족")
            for key, c in JUDGMENT_CARD_COLORS.items():
                if key in judgment:
                    j_colors = c
                    break
            badge = QLabel(f"  {judgment}  ")
            badge.setStyleSheet(
                f"background: {j_colors['badge']}; color: white; "
                "border-radius: 10px; padding: 3px 14px; "
                "font-size: 10pt; font-weight: bold;")
            header.addWidget(badge)

        deg_pct = result.get("degradation_pct")
        if deg_pct is not None:
            deg_lbl = QLabel(f"  {deg_pct:+.1f}%  ")
            deg_color = ("#C62828" if deg_pct < -10
                         else "#EF6C00" if deg_pct < -5
                         else "#2E7D32")
            deg_lbl.setFont(QFont(FONT_MONO, 12, QFont.Bold))
            deg_lbl.setStyleSheet(f"color: {deg_color};")
            header.addWidget(deg_lbl)

        header.addStretch()
        layout.addLayout(header)

        # v4.1: 기준선 정보 / 분석 데이터 분리 (QGroupBox)
        ps = result.get("period_start", "-")
        pe = result.get("period_end", "-")
        settings = load_settings()
        bl_src = result.get("baseline_source", "")
        bl_src_kr = BASELINE_SOURCE_KR.get(bl_src, bl_src or "-")
        auto_bl_days = settings.get("auto_baseline_days", 90)
        baseline_days = settings.get("baseline_days", 7)

        bl_total = result.get("baseline_sample_total")
        bl_topn = result.get("baseline_top_n")
        bl_warn = result.get("baseline_warning", "")
        bl_val_popup = result.get("baseline_value")

        # -- 기준선 정보 QGroupBox --
        baseline_section = QGroupBox("기준선 정보")
        _bl_layout = QVBoxLayout()
        bl_info_lines = []
        if bl_src == "manual":
            bl_info_lines.append("출처: 수동 기준선 (운영자 설정)")
        elif bl_src == "snapshot":
            _popup_pdesc = result.get("baseline_profile_desc", "")
            bl_info_lines.append(
                f"출처: 저장 프로필 ({_popup_pdesc})"
                if _popup_pdesc else "출처: 저장 프로필")
            bl_info_lines.append(
                "* 기준선은 저장 시점 기준이며, "
                "분석 데이터는 최근 성능 사이클 기준입니다.")
        elif "auto" in str(bl_src):
            bl_info_lines.append(
                f"출처: 자동산출(최근 {auto_bl_days}일 상위 10% 평균)")
            if bl_total and bl_topn:
                bl_info_lines.append(
                    f"산출방법: {bl_total}개 샘플 중 상위 {bl_topn}개 평균")
        else:
            bl_info_lines.append(f"출처: {bl_src_kr}")
        if bl_val_popup is not None:
            if bl_src == "manual":
                bl_info_lines.append(
                    f"기준값: {bl_val_popup:.2f} m\u00b3/h (수동)")
            else:
                bl_info_lines.append(
                    f"기준값: {bl_val_popup:.2f} m\u00b3/h")
        popup_bl_ps = result.get("baseline_period_start", "")
        popup_bl_pe = result.get("baseline_period_end", "")
        if popup_bl_ps and popup_bl_pe:
            bl_info_lines.append(f"산출구간: {popup_bl_ps} ~ {popup_bl_pe}")
        if bl_warn:
            bl_info_lines.append(f"* {bl_warn}")
        _bl_lbl = QLabel("\n".join(bl_info_lines))
        if bl_src == "manual":
            _bl_lbl.setStyleSheet(
                "color: #D97706; font-weight: bold; "
                "font-size: 9pt; padding: 4px;")
        else:
            _bl_lbl.setStyleSheet(
                "color: #555; font-size: 9pt; padding: 4px;")
        _bl_lbl.setWordWrap(True)
        _bl_layout.addWidget(_bl_lbl)
        baseline_section.setLayout(_bl_layout)
        layout.addWidget(baseline_section)

        # -- 분석 데이터 QGroupBox --
        analysis_section = QGroupBox("분석 데이터")
        _an_layout = QVBoxLayout()
        popup_valid_days = result.get("valid_data_days", 0)
        popup_rps = result.get("recent_period_start", "")
        popup_rpe = result.get("recent_period_end", "")
        popup_recent_actual = result.get("recent_actual_days", 0)
        popup_recent_range = (f"{popup_rps} ~ {popup_rpe}"
                              if popup_rps and popup_rpe
                              else f"최근 {baseline_days}일")
        an_info_lines = [
            f"분석기간: {ps} ~ {pe} (유효 {popup_valid_days}일)",
            f"최근 비교구간: {popup_recent_range}"
            f" ({popup_recent_actual}일 유효/{baseline_days}일)",
        ]
        popup_avg = result.get("avg_flow")
        if popup_avg is not None:
            an_info_lines.append(
                f"현재 평균유량: {popup_avg:.2f} m\u00b3/h")
        if deg_pct is not None:
            an_info_lines.append(f"하락률: {deg_pct:+.1f}%")
        popup_recent_warn = result.get("recent_data_warning", "")
        if popup_recent_warn:
            an_info_lines.append(f"* {popup_recent_warn}")
        _an_lbl = QLabel("\n".join(an_info_lines))
        _an_lbl.setStyleSheet("color: #555; font-size: 9pt; padding: 4px;")
        _an_lbl.setWordWrap(True)
        _an_layout.addWidget(_an_lbl)
        analysis_section.setLayout(_an_layout)
        layout.addWidget(analysis_section)

        # v3.5 정책 표시
        policy_lines = []
        if "auto" in str(bl_src):
            policy_lines.append(
                "Rolling 기준선: 최근 90일 일평균 유량 상위 10% 평균"
                " (매 분석 시 재산출)")
        popup_pc_bl = result.get("post_casing_baseline")
        if popup_pc_bl is not None:
            popup_pc_date = result.get("post_casing_date", "")
            policy_lines.append(
                f"교체 후 기준선: {popup_pc_date} 교체 이후 60일 상위"
                f" 10% 평균 = {popup_pc_bl:.2f} m\u00b3/h (고정)")
        # v4.0: 사이클 정보
        popup_cycle = result.get("cycle_start_date", "")
        if popup_cycle:
            _popup_evt = result.get("cycle_event_type", "")
            _popup_evt_kr = {"casing": "케이싱", "pump_replacement": "펌프교체"
                             }.get(_popup_evt, _popup_evt)
            policy_lines.append(
                f"성능 사이클: {popup_cycle} {_popup_evt_kr} 이후 데이터만 분석")
        if policy_lines:
            policy_label = QLabel("\n".join(policy_lines))
            policy_label.setWordWrap(True)
            policy_label.setFont(QFont(FONT_FAMILY, 8))
            policy_label.setStyleSheet(
                "background: #F5F5F5; padding: 6px; "
                "border: 1px solid #E0E0E0; "
                "border-radius: 4px; color: #555;")
            layout.addWidget(policy_label)

        # ── (B) 비교 표 ───────────────────────────────
        compare_group = QGroupBox("기준 대비 비교")
        cg_layout = QVBoxLayout()

        tbl = QTableWidget()
        tbl.setColumnCount(4)
        tbl.setHorizontalHeaderLabels(["항목", "기준", "최근", "변화"])
        tbl.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        tbl.setEditTriggers(QTableWidget.NoEditTriggers)
        tbl.verticalHeader().setVisible(False)

        baseline_val = result.get("baseline_value")
        on_time_deg = result.get("on_time_degradation_pct")
        data_rate = result.get("data_rate")

        # 최근 유량: degradation_pct 역산 (계산에 실제 사용된 값)
        if baseline_val is not None and deg_pct is not None:
            recent_flow = baseline_val * (1 + deg_pct / 100)
            popup_recent_str = f"{recent_flow:.2f}"
        else:
            avg_flow = result.get("avg_flow")
            popup_recent_str = (
                f"{avg_flow:.2f}" if avg_flow is not None else "-")

        rows = [
            (f"평균 유량(m\u00b3/h) [최근{baseline_days}일]",
             f"{baseline_val:.2f}" if baseline_val is not None else "-",
             popup_recent_str,
             f"{deg_pct:+.1f}%" if deg_pct is not None else "-"),
        ]
        on_bl = result.get("on_time_baseline")
        on_avg = result.get("daily_avg_on_minutes")
        if on_bl is not None or on_avg is not None:
            rows.append((
                "가동시간(분/일)",
                f"{on_bl:.0f}" if on_bl is not None else "-",
                f"{on_avg:.0f}" if on_avg is not None else "-",
                f"{on_time_deg:+.1f}%"
                if on_time_deg is not None else "-"))
        # 교체 후 기준선 비교 (v3.5)
        popup_pc_bl2 = result.get("post_casing_baseline")
        popup_pc_deg = result.get("post_casing_degradation_pct")
        popup_pc_date2 = result.get("post_casing_date", "")
        if popup_pc_bl2 is not None:
            if popup_pc_bl2 > 0 and popup_pc_deg is not None:
                popup_pc_recent = popup_pc_bl2 * (1 + popup_pc_deg / 100)
                popup_pc_recent_str = f"{popup_pc_recent:.2f}"
            else:
                popup_pc_recent_str = popup_recent_str
            rows.append((
                f"교체 후 기준(m\u00b3/h) [{popup_pc_date2}~]",
                f"{popup_pc_bl2:.2f}",
                popup_pc_recent_str,
                f"{popup_pc_deg:+.1f}%"
                if popup_pc_deg is not None else "-"))

        if data_rate is not None:
            rows.append(("데이터 수집률", "100%",
                         f"{data_rate:.1f}%", ""))

        tbl.setRowCount(len(rows))
        for i, (name, base, recent, change) in enumerate(rows):
            tbl.setItem(i, 0, QTableWidgetItem(name))
            item_b = QTableWidgetItem(base)
            item_b.setFont(QFont(FONT_MONO, 9))
            tbl.setItem(i, 1, item_b)
            item_r = QTableWidgetItem(recent)
            item_r.setFont(QFont(FONT_MONO, 9))
            tbl.setItem(i, 2, item_r)
            item_c = QTableWidgetItem(change)
            item_c.setFont(QFont(FONT_MONO, 9))
            tbl.setItem(i, 3, item_c)
        tbl.setMaximumHeight(40 + len(rows) * 30)
        cg_layout.addWidget(tbl)

        # 계산식 + 샘플 수 + 판정기준
        formula_parts = [
            "하락률(%) = (최근 평균 유량 \u2212 기준 평균 유량) "
            "/ 기준 평균 유량 \u00D7 100",
        ]
        if bl_total and bl_topn:
            formula_parts.append(
                f"기준 샘플: {bl_total}개 중 상위 {bl_topn}개 평균")
        formula_parts.append(
            f"판정 기준: "
            f"경과관찰 {settings.get('degradation_watch', -5)}% / "
            f"점검권장 {settings.get('degradation_warning', -10)}% / "
            f"정밀점검 {settings.get('degradation_severe', -20)}%")
        if bl_warn:
            formula_parts.append(f"* {bl_warn}")
        formula = QLabel("\n".join(formula_parts))
        formula.setStyleSheet(
            "color: #777; font-size: 8pt; font-style: italic; "
            "padding: 2px 4px;")
        formula.setWordWrap(True)
        cg_layout.addWidget(formula)
        compare_group.setLayout(cg_layout)
        layout.addWidget(compare_group)

        # ── (C) 판정 근거 ─────────────────────────────
        reason_group = QGroupBox("판정 근거")
        rg_layout = QVBoxLayout()
        reason = result.get("status_reason", "")
        reason_lbl = QLabel(reason if reason else "-")
        reason_lbl.setWordWrap(True)
        reason_lbl.setTextInteractionFlags(Qt.TextSelectableByMouse)
        reason_lbl.setStyleSheet("padding: 4px;")
        rg_layout.addWidget(reason_lbl)
        reason_group.setLayout(rg_layout)
        layout.addWidget(reason_group)

        # ── 교체 예측 (v3.5.1) ───────────────────────
        popup_forecast = result.get("replacement_forecast")
        if popup_forecast:
            fc_group = QGroupBox("교체 시점 예측")
            fc_layout = QVBoxLayout()
            fc_layout.setSpacing(4)

            months = popup_forecast["predicted_months_left"]
            rate = popup_forecast["monthly_drop_rate"]
            conf = popup_forecast["confidence"]

            if months <= 3:
                fc_fg, fc_bg, fc_bd = "#C62828", "#FFEBEE", "#C62828"
            elif months <= 6:
                fc_fg, fc_bg, fc_bd = "#EF6C00", "#FFF3E0", "#EF6C00"
            elif months <= 12:
                fc_fg, fc_bg, fc_bd = "#F57F17", "#FFFDE7", "#F57F17"
            else:
                fc_fg, fc_bg, fc_bd = "#2E7D32", "#E8F5E9", "#2E7D32"

            fc_title = ("즉시 점검 필요" if months == 0
                        else f"예상 교체 시점: {months:.0f}개월 후")
            fc_title_lbl = QLabel(fc_title)
            fc_title_lbl.setFont(QFont(FONT_MONO, 13, QFont.Bold))
            fc_title_lbl.setAlignment(Qt.AlignCenter)
            fc_title_lbl.setStyleSheet(f"color: {fc_fg}; padding: 4px;")
            fc_layout.addWidget(fc_title_lbl)

            fc_detail_lbl = QLabel(
                f"월 평균 감소율: {rate:+.2f}%/월  |  "
                f"신뢰도: {conf:.0f}%  |  "
                f"분석 데이터: {popup_forecast['data_days']}일")
            fc_detail_lbl.setFont(QFont(FONT_FAMILY, 9))
            fc_detail_lbl.setAlignment(Qt.AlignCenter)
            fc_detail_lbl.setStyleSheet("color: #555;")
            fc_layout.addWidget(fc_detail_lbl)

            fc_group.setLayout(fc_layout)
            fc_group.setStyleSheet(
                f"QGroupBox {{ background: {fc_bg}; "
                f"border: 1px solid {fc_bd}; border-radius: 6px; "
                f"margin-top: 8px; padding-top: 16px; }}")
            layout.addWidget(fc_group)

        # ── 원본 데이터 보기 (접기) ────────────────────
        raw_btn = QPushButton("원본 데이터 보기 \u25BC")
        raw_btn.setCheckable(True)
        raw_btn.setChecked(False)
        raw_btn.setStyleSheet(
            "QPushButton { text-align: left; padding: 4px 8px; "
            "color: #1565C0; border: none; font-size: 9pt; }"
            "QPushButton:hover { text-decoration: underline; }")
        layout.addWidget(raw_btn)

        raw_scroll = QScrollArea()
        raw_scroll.setWidgetResizable(True)
        raw_scroll.setVisible(False)
        raw_content = QWidget()
        raw_layout = QFormLayout(raw_content)
        raw_layout.setSpacing(3)

        skip_keys = {"_report_saved_ok", "alert_events"}
        for key in sorted(result.keys()):
            if key in skip_keys:
                continue
            value = result[key]
            label_kr = get_label(key)

            lbl_key = QLabel(f"<b>{label_kr}</b>")
            lbl_key.setFont(QFont(FONT_FAMILY, 8))

            if isinstance(value, bool):
                display = "예" if value else "아니오"
            elif isinstance(value, float):
                display = f"{value:.4f}"
            elif value is None:
                display = "-"
            elif isinstance(value, list):
                display = f"[{len(value)}건]"
            else:
                display = str(value)

            lbl_val = QLabel(display)
            lbl_val.setFont(QFont(FONT_MONO, 8))
            lbl_val.setWordWrap(True)
            lbl_val.setTextInteractionFlags(Qt.TextSelectableByMouse)
            raw_layout.addRow(lbl_key, lbl_val)

        raw_scroll.setWidget(raw_content)
        layout.addWidget(raw_scroll)

        def _toggle_raw(checked):
            raw_scroll.setVisible(checked)
            raw_btn.setText(
                "원본 데이터 접기 \u25B2" if checked
                else "원본 데이터 보기 \u25BC")
        raw_btn.toggled.connect(_toggle_raw)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok)
        buttons.accepted.connect(dlg.accept)
        layout.addWidget(buttons)

        dlg.exec()

    def _open_report_folder(self):
        try:
            subprocess.Popen(f'explorer "{REPORTS_DIR}"')
        except Exception:
            os.startfile(str(REPORTS_DIR))


# ── 설정 탭 ─────────────────────────────────────────────────
class SettingsTab(QWidget):
    def __init__(self, main_window: MainWindow):
        super().__init__()
        self.main_window = main_window
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        analysis_group = QGroupBox("분석 기준")
        a_layout = QFormLayout()

        self.inp_missing = QDoubleSpinBox()
        self.inp_missing.setRange(0, 100)
        self.inp_missing.setDecimals(1)
        self.inp_missing.setSuffix(" %")
        a_layout.addRow("데이터 확보율 임계값:", self.inp_missing)

        self.inp_min_points = QSpinBox()
        self.inp_min_points.setRange(1, 365)
        a_layout.addRow("최소 데이터 포인트 (기본):", self.inp_min_points)

        self.inp_deg_severe = QDoubleSpinBox()
        self.inp_deg_severe.setRange(-100, 0)
        self.inp_deg_severe.setDecimals(1)
        self.inp_deg_severe.setSuffix(" %")
        a_layout.addRow("정밀점검 기준 (\u2264):", self.inp_deg_severe)

        self.inp_deg_warning = QDoubleSpinBox()
        self.inp_deg_warning.setRange(-100, 0)
        self.inp_deg_warning.setDecimals(1)
        self.inp_deg_warning.setSuffix(" %")
        a_layout.addRow("점검권장 기준 (\u2264):", self.inp_deg_warning)

        self.inp_deg_watch = QDoubleSpinBox()
        self.inp_deg_watch.setRange(-100, 0)
        self.inp_deg_watch.setDecimals(1)
        self.inp_deg_watch.setSuffix(" %")
        a_layout.addRow("경과관찰 기준 (\u2264):", self.inp_deg_watch)

        self.inp_baseline_days = QSpinBox()
        self.inp_baseline_days.setRange(1, 90)
        self.inp_baseline_days.setSuffix(" 일")
        a_layout.addRow("기준선 산정 기간:", self.inp_baseline_days)

        self.inp_timer_th = QDoubleSpinBox()
        self.inp_timer_th.setRange(0, 1)
        self.inp_timer_th.setDecimals(2)
        self.inp_timer_th.setSingleStep(0.05)
        a_layout.addRow("타이머운전 집중도 임계:", self.inp_timer_th)

        analysis_group.setLayout(a_layout)
        layout.addWidget(analysis_group)

        watch_group = QGroupBox("폴더 감시")
        w_layout = QFormLayout()

        self.inp_auto_watch = QCheckBox("자동 감시 활성화")
        w_layout.addRow("", self.inp_auto_watch)

        self.inp_watch_interval = QSpinBox()
        self.inp_watch_interval.setRange(1, 60)
        self.inp_watch_interval.setSuffix(" 초")
        w_layout.addRow("감시 간격:", self.inp_watch_interval)

        watch_group.setLayout(w_layout)
        layout.addWidget(watch_group)

        # 표시 설정
        display_group = QGroupBox("표시 설정")
        d_layout = QFormLayout()
        self.inp_dark_mode = QCheckBox("다크 모드 (재시작 필요)")
        d_layout.addRow("", self.inp_dark_mode)
        display_group.setLayout(d_layout)
        layout.addWidget(display_group)

        btn_layout = QHBoxLayout()
        self.btn_save = QPushButton("설정 저장")
        self.btn_save.clicked.connect(self._save_settings)
        self.btn_save.setStyleSheet(
            "QPushButton { background-color: #4CAF50; color: white; "
            "padding: 8px 20px; border-radius: 4px; font-weight: bold; }")
        btn_layout.addWidget(self.btn_save)

        self.btn_reset = QPushButton("기본값 복원")
        self.btn_reset.clicked.connect(self._reset_defaults)
        btn_layout.addWidget(self.btn_reset)
        btn_layout.addStretch()

        layout.addLayout(btn_layout)
        layout.addStretch()

    def refresh(self):
        s = load_settings()
        self.inp_missing.setValue(s["data_rate_threshold"])
        self.inp_min_points.setValue(s["min_data_points"])
        self.inp_deg_severe.setValue(s["degradation_severe"])
        self.inp_deg_warning.setValue(s["degradation_warning"])
        self.inp_deg_watch.setValue(s["degradation_watch"])
        self.inp_baseline_days.setValue(s["baseline_days"])
        self.inp_timer_th.setValue(s["timer_hour_concentration_threshold"])
        self.inp_auto_watch.setChecked(s["auto_watch_enabled"])
        self.inp_watch_interval.setValue(s["watch_interval_seconds"])
        self.inp_dark_mode.setChecked(s.get("dark_mode", False))

    def _save_settings(self):
        settings = {
            "data_rate_threshold": self.inp_missing.value(),
            "min_data_points": self.inp_min_points.value(),
            "degradation_severe": self.inp_deg_severe.value(),
            "degradation_warning": self.inp_deg_warning.value(),
            "degradation_watch": self.inp_deg_watch.value(),
            "baseline_days": self.inp_baseline_days.value(),
            "timer_hour_concentration_threshold": self.inp_timer_th.value(),
            "auto_watch_enabled": self.inp_auto_watch.isChecked(),
            "watch_interval_seconds": self.inp_watch_interval.value(),
            "dark_mode": self.inp_dark_mode.isChecked(),
        }
        save_settings(settings)
        QMessageBox.information(self, "저장 완료", "설정이 저장되었습니다.")
        self.main_window.tab_main._log("설정 저장 완료")

    def _reset_defaults(self):
        from src.config import DEFAULT_SETTINGS
        save_settings(DEFAULT_SETTINGS)
        self.refresh()
        QMessageBox.information(self, "초기화", "기본 설정으로 복원되었습니다.")
