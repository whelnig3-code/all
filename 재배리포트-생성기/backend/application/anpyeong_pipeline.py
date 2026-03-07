"""
안평리 분석 파이프라인 - 애플리케이션 레이어.

수남리 pipeline.py 기반에서 안평리 고유 로직으로 변경.

안평리 고유 특성:
  - 컬럼명: 실내온도, 외기온, 집수정온도, 품온2 등 수남리와 다름
  - 날씨: 파일에 외기온 컬럼 포함 → Meteostat 불필요
  - 집수정온도: NaN인 경우 0.0으로 채움
  - 폴더: '안평리' 하위에 저장
  - 파일명: 재배사 + 라인 번호 포함 (예: '1재배사 - 2라인')
  - 임계값: 품온 28℃, CO2 10,000ppm
"""

import gc
import logging
import os
import re
from datetime import timedelta
from typing import Callable, Optional

from config.settings import AnpyeongConfig
from infrastructure.file_processing.loader import load_raw_dataframe
from infrastructure.file_processing.header_mapper import (
    detect_header_row,
    map_and_clean_columns,
    prepare_timeseries,
)
from infrastructure.storage.folder_utils import (
    ensure_folder_structure,
    copy_with_dedup,
)
from domain.watering.schedule_service import generate_schedule
from domain.sensor.analysis_service import analyze_events, analyze_daily
from domain.weather.resolution_service import (
    WeatherSource,
    resolve_weather_source,
)

logger = logging.getLogger("sunamri")

ProgressCallback = Optional[Callable[[int, str], None]]


class PipelineError(Exception):
    """파이프라인 단계별 오류. 사용자에게 표시할 메시지를 포함한다."""
    pass


def _detect_line_id(filename: str) -> int:
    """
    파일명에서 라인 번호를 감지한다.

    예: '1재배사 - 2라인_데이터Excel_...' → 2
    """
    m = re.search(r"(\d+)라인", filename)
    if m:
        return int(m.group(1))
    return 1


def run_pipeline(
    file_path: str,
    n_trays: int,
    root_dir: Optional[str] = None,
    progress_callback: ProgressCallback = None,
    limit_prod: Optional[float] = None,
    limit_co2: Optional[float] = None,
    original_filename: Optional[str] = None,
) -> tuple[bool, str, str]:
    """
    안평리 단일 파일에 대한 전체 분석 파이프라인 실행.

    Parameters
    ----------
    file_path : str
        입력 데이터 파일 경로 (.xls, .xlsx, .csv)
    n_trays : int
        시루(트레이) 개수 (10~20)
    root_dir : str, optional
        저장 루트 디렉토리 (기본: Desktop/재배리포트)
    progress_callback : callable, optional
        진행 상태 콜백 (percent: int, message: str)
    limit_prod : float, optional
        품온 경고 상한 오버라이드 (기본: 28.0℃)
    limit_co2 : float, optional
        CO2 경고 상한 오버라이드 (기본: 10000.0ppm)

    Returns
    -------
    tuple : (success: bool, output_path: str, message: str)
    """
    def _progress(pct: int, msg: str):
        if progress_callback:
            progress_callback(pct, msg)

    config = AnpyeongConfig()
    # 임계값 오버라이드 (UI에서 사용자가 지정한 경우)
    if limit_prod is not None:
        config.THRESHOLDS["limit_prod"] = float(limit_prod)
    if limit_co2 is not None:
        config.THRESHOLDS["limit_co2"] = float(limit_co2)
    logger.info(
        f"[안평리] 파이프라인 시작: {os.path.basename(file_path)} "
        f"(시루: {n_trays}개, 품온상한: {config.THRESHOLDS['limit_prod']}℃, "
        f"CO2상한: {config.THRESHOLDS['limit_co2']}ppm)"
    )

    # ── 입력 검증 ────────────────────────────────────
    if not os.path.isfile(file_path):
        raise PipelineError(f"파일이 존재하지 않습니다: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise PipelineError("빈 파일입니다. (0 바이트)")
    if file_size > 500 * 1024 * 1024:
        raise PipelineError(f"파일이 너무 큽니다 ({file_size // 1024 // 1024}MB). 500MB 이하만 지원.")

    # root_dir 미리 확정 (폴더는 batch_start_time 확인 후 생성)
    if root_dir is None:
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        root_dir = os.path.join(desktop, "재배리포트")

    # ── Step 1: 데이터 로딩 ───────────────────────────
    _progress(10, "데이터 파일 로딩 중...")
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
    logger.info(f"  로딩: {len(raw_df)}행 × {len(raw_df.columns)}열")

    # ── Step 2: 헤더 매핑 ────────────────────────────
    _progress(20, "헤더 매핑 및 컬럼 정리 중...")
    try:
        header_idx = detect_header_row(raw_df)
        df = map_and_clean_columns(raw_df, header_idx, config)
    except ValueError as e:
        raise PipelineError(f"헤더 매핑 실패: {e}")
    except Exception as e:
        raise PipelineError(f"컬럼 매핑 오류: {type(e).__name__}: {e}")

    del raw_df
    gc.collect()

    missing = df.attrs.get("_missing_sensors", [])
    if missing:
        logger.warning(f"  누락 센서: {missing}")
    critical_missing = [c for c in ["재배사온도(℃)", "품온(℃)"] if c in missing]
    if critical_missing:
        raise PipelineError(
            f"필수 센서 컬럼 없음: {', '.join(critical_missing)}\n"
            "헤더 키워드: 실내온도/재배사온도/Room, 품온/Prod"
        )

    # ── Step 2.5: 안평리 고유 - 집수정온도 NaN → 0.0 채움 ────
    jip_col = "집수정온도(℃)"
    if jip_col in df.columns:
        nan_count = df[jip_col].isna().sum()
        if nan_count > 0:
            df[jip_col] = df[jip_col].fillna(0.0)
            logger.info(f"  집수정온도 NaN {nan_count}건 → 0.0 채움")
    else:
        df[jip_col] = 0.0
        logger.info("  집수정온도 컬럼 없음 → 전체 0.0으로 생성")

    # ── Step 2.6: 날씨 데이터 전략 결정 ─────────────────
    # 안평리는 파일에 외기온 있으므로 Meteostat 스킵
    weather_source, weather_col = resolve_weather_source(df)
    logger.info(f"  날씨 소스: {weather_source.value} (컬럼: {weather_col})")
    if weather_source != WeatherSource.FILE:
        logger.warning("  외부기온 컬럼 데이터 부족 - 날씨 없이 진행")

    # ── Step 3: 시계열 준비 ───────────────────────────
    _progress(30, "시계열 데이터 준비 중...")
    try:
        df, room_id, batch_start_time = prepare_timeseries(df, file_path)
    except ValueError as e:
        raise PipelineError(f"시계열 처리 실패: {e}")
    except MemoryError:
        raise PipelineError("메모리 부족. 파일 크기를 줄이거나 다른 프로그램을 종료하세요.")
    except Exception as e:
        raise PipelineError(f"시계열 오류: {type(e).__name__}: {e}")

    # 파일명에서 라인 번호 추출
    # original_filename 우선 사용: 업로드 시 임시 경로(tmpXXX.xls)로 저장되어
    # 원본 파일명이 손실되므로 API 계층에서 원본 파일명을 전달받아야 정확함
    _name_for_detection = original_filename or os.path.basename(file_path)
    line_id = _detect_line_id(_name_for_detection)

    # 안평리 라인→재배사 매핑 (라인 번호로 재배사 번호를 결정)
    # 1,2라인 → 1재배사 / 3,4라인 → 2재배사 / 5,6라인 → 3재배사
    # 7,8라인 → 4재배사 / 9,10라인 → 5재배사
    room_id = (line_id + 1) // 2
    logger.info(f"  재배사: {room_id}번 (라인 {line_id}번 기반 결정), 배치시작: {batch_start_time}, 데이터: {len(df)}행")

    # ── 폴더 구조 생성 (생산일 기준 년/월, 안평리 폴더) ─────────
    # 생산일 = 데이터 마지막 날 + 1일 (6일차 데이터 다음날 생산)
    _prod_dt_for_folder = batch_start_time + timedelta(days=6)
    _progress(32, "폴더 구조 생성 중...")
    paths = ensure_folder_structure(
        root_dir,
        _prod_dt_for_folder.year,
        _prod_dt_for_folder.month,
        factory_name="안평리",
    )
    logger.info(f"  폴더: {paths['base']}")
    try:
        copied_file = copy_with_dedup(file_path, paths["raw_data"])
        logger.info(f"  원본 복사: {os.path.basename(copied_file)}")
    except Exception as e:
        logger.warning(f"  원본 복사 실패 (비치명적): {e}")

    # ── Step 4: 살수 스케줄 생성 ──────────────────────
    _progress(40, "살수 스케줄 생성 중...")
    try:
        events = generate_schedule(
            batch_start_time, room_id, n_trays,
            config.ROOM_SCHEDULES, config.DEFAULT_HOURS, config,
        )
    except Exception as e:
        raise PipelineError(f"스케줄 생성 오류: {e}")

    if not events:
        raise PipelineError("살수 이벤트가 생성되지 않았습니다. 데이터 기간을 확인하세요.")
    logger.info(f"  살수 이벤트 {len(events)}개")

    # ── Step 5: 데이터 분석 ───────────────────────────
    _progress(55, "이벤트 및 일별 분석 중...")
    try:
        event_df = analyze_events(df, events, config)
        daily_df, daily_results = analyze_daily(df, events, event_df, config)
    except Exception as e:
        raise PipelineError(f"분석 오류: {type(e).__name__}: {e}")

    if daily_df.empty:
        raise PipelineError("일별 분석 결과가 비어있습니다.")

    del df
    gc.collect()

    # ── Step 6: 출력 경로 ────────────────────────────
    _progress(70, "리포트 파일 경로 생성 중...")
    start_dt = batch_start_time
    end_dt = start_dt + timedelta(days=5)
    prod_dt = end_dt + timedelta(days=1)

    prod_str = f"{prod_dt.month}월 {prod_dt.day}일 생산"
    start_str = start_dt.strftime("%Y-%m-%d")
    end_str = end_dt.strftime("%Y-%m-%d")
    output_filename = (
        f"{prod_str} ({line_id})라인 ({room_id})재배사 "
        f"({start_str}~{end_str})모니터링 데이터.xlsx"
    )
    output_path = os.path.join(paths["report"], output_filename)

    # ── Step 7: Excel 리포트 생성 ─────────────────────
    _progress(75, "Excel 리포트 작성 중...")
    logger.info(f"Step 7: Excel 생성 → {output_filename}")

    try:
        from infrastructure.excel.report_builder import build_report
        success = build_report(
            event_df, daily_df, daily_results, events, config,
            output_path, prod_dt, room_id,
            factory_name="안평리", line_id=line_id,
            progress_callback=lambda pct, msg: _progress(75 + int(pct * 0.2), msg),
        )
    except PermissionError:
        raise
    except MemoryError:
        raise PipelineError("Excel 생성 중 메모리 부족.")
    except Exception as e:
        raise PipelineError(f"Excel 생성 오류: {type(e).__name__}: {e}")

    del event_df, daily_df, daily_results
    gc.collect()

    _progress(100, "완료!")
    logger.info(f"[안평리] 파이프라인 완료: {output_filename}")
    return success, output_path, f"리포트 생성 완료: {output_filename}"
