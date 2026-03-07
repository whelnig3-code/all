"""
안평리 숙주 재배 리포트 생성기 v6.0 - 분석 엔진

GUI와 완전 분리된 데이터 처리 파이프라인.
이 패키지는 GUI를 참조하지 않는다.
"""

import gc
import logging
import os
from datetime import timedelta

from config.settings import SproutConfig
from engine.loader import load_raw_dataframe
from engine.header_mapper import detect_header_row, map_and_clean_columns, prepare_timeseries
from engine.scheduler import generate_schedule
from engine.analyzer import analyze_events, analyze_daily
from engine.excel_builder import build_report
from engine.folder_utils import (
    extract_year_month_with_fallback,
    ensure_folder_structure,
    copy_with_dedup,
)
from engine.stats import compute_summary_stats, write_summary_files

_logger = logging.getLogger("anpyeong")


class PipelineError(Exception):
    """파이프라인 단계별 오류. 사용자에게 표시할 메시지를 포함한다."""
    pass


def run_pipeline(file_path, n_trays, root_dir=None, progress_callback=None):
    """
    단일 파일에 대한 전체 분석 파이프라인 실행.

    Parameters
    ----------
    file_path : str
        입력 데이터 파일 경로 (.xls, .xlsx, .csv, .html)
    n_trays : int
        트레이 수 (호환용, 로깅만 사용)
    root_dir : str, optional
        저장 루트 디렉토리 (기본: Desktop/재배리포트)
    progress_callback : callable, optional
        진행 상태 콜백 함수 (percent: int, message: str)

    Returns
    -------
    tuple : (success: bool, output_path: str, message: str)

    Raises
    ------
    PipelineError
        분석 중 복구 불가능한 오류
    PermissionError
        출력 파일이 잠겨있을 때
    """
    def _progress(pct, msg):
        if progress_callback:
            progress_callback(pct, msg)

    config = SproutConfig()
    _logger.info(f"파이프라인 시작: {os.path.basename(file_path)} (트레이: {n_trays})")

    # ── 입력 검증 ────────────────────────────────────
    if not os.path.isfile(file_path):
        raise PipelineError(f"파일이 존재하지 않습니다: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise PipelineError("빈 파일입니다. (0 바이트)")
    if file_size > 500 * 1024 * 1024:  # 500MB
        raise PipelineError(
            f"파일이 너무 큽니다 ({file_size // 1024 // 1024}MB). "
            f"500MB 이하 파일만 지원합니다."
        )

    # ── 폴더 구조 생성 + 원본 복사 ────────────────────
    _progress(5, "폴더 구조 생성 중...")
    if root_dir is None:
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        root_dir = os.path.join(desktop, "재배리포트")

    year, month = extract_year_month_with_fallback(file_path)
    paths = ensure_folder_structure(root_dir, "안평리", year, month)
    _logger.info(f"  폴더 구조: {paths['base']}")

    try:
        copied_file = copy_with_dedup(file_path, paths["raw_data"])
        _logger.info(f"  원본 복사: {os.path.basename(copied_file)}")
    except Exception as e:
        _logger.warning(f"  원본 복사 실패 (비치명적): {e}")

    # ── Step 1: 데이터 로딩 ───────────────────────────
    _progress(10, "데이터 파일 로딩 중...")
    _logger.info(f"Step 1: 데이터 로딩 ({file_size:,} bytes)")
    try:
        raw_df = load_raw_dataframe(file_path)
    except ImportError as e:
        raise PipelineError(f"라이브러리 부족: {e}")
    except ValueError as e:
        raise PipelineError(f"파일 읽기 실패: {e}")
    except Exception as e:
        raise PipelineError(f"파일 로딩 오류: {type(e).__name__}: {e}")

    if raw_df.empty:
        raise PipelineError("파일에 데이터가 없습니다.")
    _logger.info(f"  로딩 완료: {len(raw_df)} 행, {len(raw_df.columns)} 열")

    # ── Step 2: 헤더 매핑 ────────────────────────────
    _progress(20, "헤더 매핑 및 컬럼 정리 중...")
    _logger.info("Step 2: 헤더 매핑")
    try:
        header_idx = detect_header_row(raw_df)
        _logger.info(f"  헤더 행: {header_idx}")
        df = map_and_clean_columns(raw_df, header_idx, config)
    except ValueError as e:
        raise PipelineError(f"헤더 매핑 실패: {e}")
    except Exception as e:
        raise PipelineError(f"컬럼 매핑 오류: {type(e).__name__}: {e}")

    # 원본 DataFrame 해제
    del raw_df
    gc.collect()

    # 매핑 진단: 필수 센서가 모두 누락이면 경고
    missing = df.attrs.get("_missing_sensors", [])
    mapping_log = df.attrs.get("_mapping_log", {})
    if mapping_log:
        _logger.info(f"  매핑 결과: {mapping_log}")
    if missing:
        _logger.warning(f"  누락 센서: {missing}")
    critical_missing = [c for c in ["재배사온도(℃)", "품온(℃)"] if c in missing]
    if critical_missing:
        raise PipelineError(
            f"필수 센서 컬럼을 찾을 수 없습니다: {', '.join(critical_missing)}\n"
            f"파일의 헤더를 확인하세요. 지원 키워드: 실내/재배사/Room, 품온/Prod"
        )

    # ── Step 3: 시계열 준비 ───────────────────────────
    _progress(30, "시계열 데이터 준비 중...")
    _logger.info("Step 3: 시계열 준비")
    try:
        df, room_id, line_id, batch_start_time = prepare_timeseries(df, file_path)
    except ValueError as e:
        raise PipelineError(f"시계열 처리 실패: {e}")
    except MemoryError:
        raise PipelineError(
            "메모리 부족으로 데이터를 처리할 수 없습니다. "
            "파일 크기를 줄이거나 다른 프로그램을 종료하세요."
        )
    except Exception as e:
        raise PipelineError(f"시계열 오류: {type(e).__name__}: {e}")

    _logger.info(f"  재배사: {line_id}라인 {room_id}재배사, 배치시작: {batch_start_time}")
    _logger.info(f"  시계열 데이터: {len(df)} 행")

    # ── Step 4: 살수 스케줄 생성 ──────────────────────
    _progress(40, "살수 스케줄 생성 중...")
    _logger.info("Step 4: 살수 스케줄 생성")
    try:
        events = generate_schedule(
            df, room_id, line_id, batch_start_time,
            config.ROOM_SCHEDULES, config.DEFAULT_HOURS,
        )
    except Exception as e:
        raise PipelineError(f"스케줄 생성 오류: {e}")

    if not events:
        raise PipelineError(
            "살수 이벤트가 생성되지 않았습니다. "
            "데이터 기간이 배치 시작 시점 이전일 수 있습니다."
        )

    _logger.info(f"  살수 이벤트 {len(events)}개 생성")

    # ── Step 5: 데이터 분석 ───────────────────────────
    _progress(55, "이벤트 및 일별 분석 중...")
    _logger.info("Step 5: 데이터 분석")
    try:
        event_df = analyze_events(df, events, config)
        daily_df, daily_results = analyze_daily(df, events, event_df, config)
    except Exception as e:
        raise PipelineError(f"분석 오류: {type(e).__name__}: {e}")

    if daily_df.empty:
        raise PipelineError(
            "일별 분석 결과가 비어있습니다. 유효한 일별 데이터가 없습니다."
        )

    # ── Step 5.5: 통계 요약 생성 ──────────────────────
    _progress(65, "통계 요약 생성 중...")
    _logger.info("Step 5.5: 통계 요약")
    summary_stats = None
    try:
        summary_stats = compute_summary_stats(df, events, event_df, daily_df, daily_results)
    except Exception as e:
        _logger.warning(f"통계 요약 생성 실패 (비치명적): {e}")

    # 분석 완료 후 원본 df 해제
    del df
    gc.collect()

    # ── Step 6: 출력 경로 생성 ────────────────────────
    _progress(70, "리포트 파일 생성 중...")
    start_dt = batch_start_time
    end_dt = start_dt + timedelta(days=5)
    prod_dt = end_dt + timedelta(days=1)

    target_dir = paths["report"]

    prod_str = f"{prod_dt.month}월 {prod_dt.day}일 생산"
    start_str = start_dt.strftime("%Y-%m-%d")
    end_str = end_dt.strftime("%Y-%m-%d")
    output_filename = (
        f"{prod_str} {line_id}라인 {room_id}재배사 "
        f"({start_str}~{end_str})모니터링 데이터.xlsx"
    )
    output_path = os.path.join(target_dir, output_filename)

    # ── Step 7: Excel 리포트 생성 ─────────────────────
    _progress(75, "Excel 리포트 작성 중...")
    _logger.info(f"Step 7: Excel 리포트 생성 → {output_filename}")
    try:
        success = build_report(
            event_df, daily_df, daily_results, events, config,
            output_path, prod_dt, line_id, room_id,
            progress_callback=lambda pct, msg: _progress(75 + int(pct * 0.2), msg),
        )
    except PermissionError:
        raise  # GUI에서 별도 처리
    except MemoryError:
        raise PipelineError(
            "Excel 리포트 생성 중 메모리 부족. "
            "다른 프로그램을 종료한 후 다시 시도하세요."
        )
    except Exception as e:
        raise PipelineError(f"Excel 생성 오류: {type(e).__name__}: {e}")

    # ── Step 7.5: 통계 파일 저장 ──────────────────────
    if summary_stats:
        try:
            json_path, csv_path = write_summary_files(summary_stats, paths["report"])
            _logger.info(f"  통계 파일: {os.path.basename(json_path)}")
        except Exception as e:
            _logger.warning(f"통계 파일 저장 실패 (비치명적): {e}")

    # 중간 데이터 해제
    del event_df, daily_df, daily_results
    gc.collect()

    _progress(100, "완료!")
    _logger.info(f"파이프라인 완료: {output_filename}")
    return success, output_path, f"리포트 생성 완료: {output_filename}"
