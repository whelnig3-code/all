"""
수남리 분석 파이프라인 - 애플리케이션 레이어.

안평리 engine/__init__.py (run_pipeline)에서 이식 및 고도화.

변경사항:
  - GUI 의존성 제거 (tkinter → FastAPI 친화적 예외/콜백)
  - 날씨 전략: 파일 우선 → Meteostat 폴백
  - 수남리 고유 스케줄러 사용 (시루 개수 기반)
  - GW/Hot 살수 분석
"""

import gc
import logging
import os
from datetime import timedelta
from typing import Callable, Optional

from config.settings import SunamriConfig
from infrastructure.file_processing.loader import load_raw_dataframe
from infrastructure.file_processing.header_mapper import (
    detect_header_row,
    map_and_clean_columns,
    prepare_timeseries,
)
from infrastructure.weather.openmeteo_client import fetch_weather as fetch_weather_openmeteo
from infrastructure.weather.meteostat_client import fetch_weather as fetch_weather_meteostat
from infrastructure.storage.folder_utils import (
    ensure_folder_structure,
    copy_with_dedup,
)
from domain.watering.schedule_service import generate_schedule
from domain.sensor.analysis_service import analyze_events, analyze_daily
from domain.weather.resolution_service import (
    WeatherSource,
    resolve_weather_source,
    merge_weather_into_daily,
)

logger = logging.getLogger("sunamri")

ProgressCallback = Optional[Callable[[int, str], None]]


class PipelineError(Exception):
    """파이프라인 단계별 오류. 사용자에게 표시할 메시지를 포함한다."""
    pass


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
    단일 파일에 대한 전체 분석 파이프라인 실행.

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

    Returns
    -------
    tuple : (success: bool, output_path: str, message: str)
    """
    def _progress(pct: int, msg: str):
        if progress_callback:
            progress_callback(pct, msg)

    config = SunamriConfig()
    # 임계값 오버라이드 (UI에서 사용자가 지정한 경우)
    if limit_prod is not None:
        config.THRESHOLDS["limit_prod"] = float(limit_prod)
    if limit_co2 is not None:
        config.THRESHOLDS["limit_co2"] = float(limit_co2)
    logger.info(
        f"파이프라인 시작: {os.path.basename(file_path)} "
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
            "헤더 키워드: 실내/재배사/Room, 품온/Prod"
        )

    # ── Step 2.5: 날씨 데이터 전략 결정 ─────────────────
    weather_source, weather_col = resolve_weather_source(df)
    logger.info(f"  날씨 소스: {weather_source.value} (컬럼: {weather_col})")

    # ── Step 3: 시계열 준비 ───────────────────────────
    _progress(30, "시계열 데이터 준비 중...")
    try:
        df, room_id, batch_start_time = prepare_timeseries(df, file_path, original_filename=original_filename)
    except ValueError as e:
        raise PipelineError(f"시계열 처리 실패: {e}")
    except MemoryError:
        raise PipelineError("메모리 부족. 파일 크기를 줄이거나 다른 프로그램을 종료하세요.")
    except Exception as e:
        raise PipelineError(f"시계열 오류: {type(e).__name__}: {e}")

    logger.info(f"  재배사: {room_id}번, 배치시작: {batch_start_time}, 데이터: {len(df)}행")

    # ── 폴더 구조 생성 (생산일 기준 년/월) ──────────────────
    # 생산일 = 데이터 마지막 날 + 1일 (6일차 데이터 다음날 생산)
    _prod_dt_for_folder = batch_start_time + timedelta(days=6)
    _progress(32, "폴더 구조 생성 중...")
    paths = ensure_folder_structure(
        root_dir,
        _prod_dt_for_folder.year,
        _prod_dt_for_folder.month,
    )
    logger.info(f"  폴더: {paths['base']}")
    try:
        copied_file = copy_with_dedup(file_path, paths["raw_data"])
        logger.info(f"  원본 복사: {os.path.basename(copied_file)}")
    except Exception as e:
        logger.warning(f"  원본 복사 실패 (비치명적): {e}")

    # ── Step 3.5: 날씨 API 호출 (필요시) ────────────────
    weather_daily = {}
    weather_hourly_df = __import__("pandas").DataFrame()

    if weather_source == WeatherSource.API:
        _progress(35, "외부 날씨 데이터 조회 중 (Open-Meteo)...")
        # Open-Meteo 우선 시도 (최신 데이터 즉시 제공)
        weather_daily, weather_hourly_df = fetch_weather_openmeteo(
            batch_start_time,
            config.WEATHER_STATION_LAT,
            config.WEATHER_STATION_LON,
        )
        # Open-Meteo 실패 시 Meteostat 폴백
        if not weather_daily and weather_hourly_df.empty:
            logger.warning("  Open-Meteo 데이터 없음 → Meteostat 폴백 시도...")
            _progress(37, "외부 날씨 데이터 조회 중 (Meteostat 폴백)...")
            weather_daily, weather_hourly_df = fetch_weather_meteostat(
                batch_start_time,
                config.WEATHER_STATION_ID,
                config.WEATHER_STATION_LAT,
                config.WEATHER_STATION_LON,
                config.WEATHER_STATION_ALT,
            )
    else:
        logger.info("  날씨 데이터: 파일에서 사용 (Open-Meteo 스킵)")

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

    # ── Step 5.5: 날씨 데이터 일별 병합 (API 소스인 경우) ──
    if weather_source == WeatherSource.API and (weather_daily or not weather_hourly_df.empty):
        _progress(60, "날씨 데이터 병합 중...")
        import numpy as np
        for day, result in daily_results.items():
            target_date_str = result["data"]["dt"].dt.date.iloc[0].strftime("%Y-%m-%d")
            result["data"] = merge_weather_into_daily(
                result["data"], weather_hourly_df, weather_daily, target_date_str
            )
            # daily_df의 외부기온 통계도 업데이트 (analyze_daily 실행 시점엔 날씨 없었음)
            ext_col = "외부기온(℃)"
            if ext_col in result["data"].columns:
                ext_series = result["data"][ext_col].dropna()
                if not ext_series.empty:
                    mask = daily_df["day_index"] == day
                    daily_df.loc[mask, "Ext_Min"] = round(float(ext_series.min()), 1)
                    daily_df.loc[mask, "Ext_Max"] = round(float(ext_series.max()), 1)
                    daily_df.loc[mask, "Ext_Avg"] = round(float(ext_series.mean()), 1)

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
        f"{prod_str} ({room_id})재배사 "
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
            factory_name="수남리", line_id=None,
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
    logger.info(f"파이프라인 완료: {output_filename}")
    return success, output_path, f"리포트 생성 완료: {output_filename}"
