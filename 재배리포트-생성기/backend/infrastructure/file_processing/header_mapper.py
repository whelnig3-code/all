"""
헤더 감지 및 컬럼 매핑 모듈.

안평리 engine/header_mapper.py 에서 이식.
수남리 변경: 집수정온도 컬럼 없음, 배치 시작 감지 로직 변경.

배치 시작 시간 감지: CO2 > 1200 AND hour >= 15 인 첫 행 (수남리 고유)
"""

import gc
import os
import re

import numpy as np
import pandas as pd
from datetime import timedelta


def detect_header_row(df):
    """DataFrame에서 헤더 행 인덱스를 감지한다."""
    keywords = ["일시", "Date", "Time", "온도", "Temp", "품온"]
    for i in range(min(50, len(df))):
        row_str = " ".join(str(x) for x in df.iloc[i].values)
        if any(k in row_str for k in keywords):
            return i
    return -1


def map_and_clean_columns(df, header_row_idx, config):
    """헤더 행 적용 후 키워드 기반 컬럼 매핑 및 수치 정제를 수행한다."""
    df = df.copy()

    if header_row_idx != -1:
        df.columns = df.iloc[header_row_idx]
        df = df.iloc[header_row_idx + 1:].reset_index(drop=True)

    df.columns = [str(c).strip() for c in df.columns]

    if df.empty:
        raise ValueError("데이터가 비어있습니다.")

    aliases = getattr(config, "HEADER_ALIASES", {})
    if aliases:
        rename_alias = {}
        for col in df.columns:
            c_norm = _normalize(col)
            for alias, target in aliases.items():
                if _normalize(alias) == c_norm:
                    rename_alias[col] = target
                    break
        if rename_alias:
            df.rename(columns=rename_alias, inplace=True)

    rename_map = {}
    used_cols = []
    mapping_log = {}

    for target_name in config.MAPPING_ORDER:
        keywords = config.HEADER_MAPPING_KEYWORDS.get(target_name, [])
        candidates = _find_candidates(df.columns, used_cols, keywords)

        if not candidates:
            mapping_log[target_name] = "매핑 실패 (후보 없음)"
            continue

        best_col = _pick_best_candidate(df, candidates, target_name)

        if best_col:
            rename_map[best_col] = target_name
            used_cols.append(best_col)
            mapping_log[target_name] = f"'{best_col}' → '{target_name}'"
        else:
            mapping_log[target_name] = f"매핑 실패"

    df.rename(columns=rename_map, inplace=True)
    df = df.loc[:, ~df.columns.duplicated()]

    if "dt" not in df.columns:
        df.rename(columns={df.columns[0]: "dt"}, inplace=True)

    missing_sensors = []
    for col in config.SENSOR_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan
            missing_sensors.append(col)
        else:
            try:
                df[col] = df[col].astype(str).apply(lambda x: re.sub(r"[^0-9.\-]", "", x))
                df[col] = pd.to_numeric(df[col], errors="coerce")
            except Exception:
                df[col] = pd.to_numeric(df[col], errors="coerce")

    df.attrs["_mapping_log"] = mapping_log
    df.attrs["_missing_sensors"] = missing_sensors

    return df


def prepare_timeseries(df, file_path, original_filename=None):
    """
    시계열 정제 및 메타데이터(재배사) 감지를 수행한다.

    수남리 고유:
      - 배치 시작 시간: CO2 > 1200 AND hour >= 15 인 첫 행
        → 없으면 첫 번째 행으로 폴백
      - 라인 개념 없음 (line_id 항상 0 반환)

    Parameters
    ----------
    original_filename : str, optional
        업로드 원본 파일명. 임시 경로(tmpXXX.xls) 대신 이 이름으로 재배사 번호를 감지한다.
    """
    df = df.copy()

    df["dt"] = pd.to_datetime(df["dt"], errors="coerce")
    total_count = len(df)
    df = df.dropna(subset=["dt"])

    if df.empty:
        raise ValueError(
            f"유효한 날짜 데이터가 없습니다. (전체 {total_count}행 중 파싱 성공 0행)"
        )

    if df["dt"].dt.tz is not None:
        df["dt"] = df["dt"].dt.tz_localize(None)

    df = df.sort_values("dt")

    # 파일명에서 재배사 번호 감지 (원본 파일명 우선)
    filename = original_filename or os.path.basename(file_path)
    room_id = _detect_room_id(filename)

    # 수남리 배치 시작 감지: CO2 > 1200 AND 오후(15시 이후) 첫 행
    col_co2 = "CO2농도(ppm)"
    batch_start_time = None
    if col_co2 in df.columns:
        mask = (df[col_co2] > 1200) & (df["dt"].dt.hour >= 15)
        cands = df.loc[mask]
        if not cands.empty:
            batch_start_time = cands.iloc[0]["dt"]

    if batch_start_time is None:
        batch_start_time = df["dt"].iloc[0]

    start_buffer = batch_start_time - timedelta(hours=2)
    end_buffer = batch_start_time + timedelta(days=6, hours=23)
    df = df[(df["dt"] >= start_buffer) & (df["dt"] <= end_buffer)].copy()

    if df.empty:
        raise ValueError("지정 기간에 데이터가 없습니다.")

    gc.collect()

    # ── 분 단위 집계 (중복 timestamp 제거) ──────────────────────────
    # 주의: 전역 1분 리샘플(resample+interpolate)은 GW/Hot 경계에서
    #       온도 보간 오염을 유발하므로 제거.
    # 대신 같은 분에 여러 행이 있을 경우에만 평균(CO2는 최대값)으로 집계.
    # 1분 간격 리샘플 및 보간은 analyze_daily 내 per-day 단위로만 수행.
    df["dt"] = df["dt"].dt.floor("min")
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    agg_dict = {col: "mean" for col in numeric_cols}
    if col_co2 in agg_dict:
        agg_dict[col_co2] = "max"
    df = df.groupby("dt", as_index=False).agg(agg_dict)
    df = df.sort_values("dt").reset_index(drop=True)

    base_day = batch_start_time.replace(hour=0, minute=0, second=0, microsecond=0)
    df["Day_Index"] = ((df["dt"] - base_day).dt.total_seconds() / 86400).astype(int) + 1

    return df, room_id, batch_start_time


def _detect_room_id(filename):
    """파일명에서 재배사 번호를 감지한다.

    우선순위:
      1. "만지작데이터(N)" 또는 "데이터(N)" 패턴  → 수남리 원본 파일명
      2. "3재배사", "재배사3", "room3" 패턴
    """
    # 수남리 원본 파일명: 만지작데이터(2)_... 또는 데이터(2)_...
    for pattern in [r"만지작데이터\((\d+)\)", r"데이터\((\d+)\)"]:
        m = re.search(pattern, filename)
        if m:
            return int(m.group(1))
    # 범용 패턴
    for pattern in [r"(\d+)재배사", r"재배사(\d+)", r"[Rr]oom(\d+)"]:
        m = re.search(pattern, filename)
        if m:
            return int(m.group(1))
    return 1


def _normalize(text):
    return re.sub(r"[\s\n\r\t()（）℃%·\-_]", "", str(text)).lower()


def _find_candidates(columns, used_cols, keywords):
    candidates = []
    for col in columns:
        if col in used_cols:
            continue
        c_norm = _normalize(col)
        for kw in keywords:
            kw_norm = _normalize(kw)
            if kw_norm in c_norm:
                candidates.append(col)
                break
    return candidates


def _pick_best_candidate(df, candidates, target_name):
    # 1순위: 컬럼명이 target_name과 정확히 일치하는 경우 즉시 반환
    for cand in candidates:
        if cand.strip() == target_name.strip():
            return cand

    # 2순위: 유효 숫자 데이터가 가장 많은 컬럼 선택
    best_col = None
    max_valid = -1
    for cand in candidates:
        try:
            if target_name == "dt":
                valid_count = 9999999
            else:
                valid_count = pd.to_numeric(df[cand], errors="coerce").notna().sum()
            if valid_count > max_valid:
                max_valid = valid_count
                best_col = cand
        except Exception:
            continue
    return best_col
