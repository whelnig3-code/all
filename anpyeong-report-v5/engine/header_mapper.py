"""
헤더 감지 및 컬럼 매핑 모듈.

원본 DataFrame의 헤더 행을 자동 감지하고,
키워드 기반으로 표준 컬럼명에 매핑한다.
이후 수치형 정제, 시계열 보정, 재배사/라인 감지까지 수행한다.
"""

import gc
import os
import re

import numpy as np
import pandas as pd
from datetime import timedelta


# ─── 헤더 감지 ─────────────────────────────────────────

def detect_header_row(df):
    """
    DataFrame에서 헤더 행 인덱스를 감지한다.

    Returns
    -------
    int
        헤더 행 인덱스 (-1이면 감지 실패)
    """
    keywords = ["일시", "Date", "Time", "온도", "Temp", "품온"]
    for i in range(min(50, len(df))):
        row_str = " ".join(str(x) for x in df.iloc[i].values)
        if any(k in row_str for k in keywords):
            return i
    return -1


# ─── 컬럼 매핑 ─────────────────────────────────────────

def map_and_clean_columns(df, header_row_idx, config):
    """
    헤더 행 적용 후 키워드 기반 컬럼 매핑 및 수치 정제를 수행한다.

    Raises
    ------
    ValueError
        필수 컬럼(dt)을 찾을 수 없거나 데이터가 완전히 비어있을 때
    """
    df = df.copy()

    # 헤더 행 적용
    if header_row_idx != -1:
        df.columns = df.iloc[header_row_idx]
        df = df.iloc[header_row_idx + 1:].reset_index(drop=True)

    df.columns = [str(c).strip() for c in df.columns]

    if df.empty:
        raise ValueError("데이터가 비어있습니다. 헤더 행만 있는 파일일 수 있습니다.")

    # 1차: 수동 오버라이드 (config에 HEADER_ALIASES가 있으면)
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

    # 2차: 키워드 기반 자동 매핑
    rename_map = {}
    used_cols = []
    mapping_log = {}  # 진단용

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
            mapping_log[target_name] = f"매핑 실패 (후보 {len(candidates)}개 중 유효 데이터 없음)"

    df.rename(columns=rename_map, inplace=True)
    df = df.loc[:, ~df.columns.duplicated()]

    # dt 컬럼 확보
    if "dt" not in df.columns:
        df.rename(columns={df.columns[0]: "dt"}, inplace=True)
        mapping_log["dt"] = f"'{df.columns[0]}' → 'dt' (fallback: 첫 번째 컬럼)"

    # 센서 컬럼 수치 정제
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

    # 매핑 결과를 DataFrame에 메타데이터로 첨부
    df.attrs["_mapping_log"] = mapping_log
    df.attrs["_missing_sensors"] = missing_sensors

    return df


def _normalize(text):
    """비교용 문자열 정규화: 공백/특수문자 제거 + 소문자."""
    return re.sub(r"[\s\n\r\t()（）℃%·\-_]", "", str(text)).lower()


def _find_candidates(columns, used_cols, keywords):
    """
    키워드 매칭으로 후보 컬럼을 찾는다.
    대소문자 무시, 공백/특수문자 무시.
    """
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
    """유효 데이터가 가장 많은 후보를 선택한다."""
    best_col = None
    max_valid = -1

    for cand in candidates:
        try:
            if target_name == "dt":
                valid_count = 9999999
            else:
                # 이미 숫자인 컬럼도 안전하게 처리
                valid_count = pd.to_numeric(df[cand], errors="coerce").notna().sum()
            if valid_count > max_valid:
                max_valid = valid_count
                best_col = cand
        except Exception:
            continue

    return best_col


# ─── 시계열 준비 ───────────────────────────────────────

def prepare_timeseries(df, file_path):
    """
    시계열 정제 및 메타데이터(재배사/라인) 감지를 수행한다.

    [메모리 최적화] 날짜 필터링을 리샘플 전에 수행하여
    대용량 파일(1~3개월분)에서도 메모리 피크를 억제한다.

    Returns
    -------
    tuple : (df, room_id, line_id, batch_start_time)

    Raises
    ------
    ValueError
        유효한 날짜 데이터가 없거나 데이터가 비어있을 때
    """
    df = df.copy()

    # datetime 파싱
    df["dt"] = pd.to_datetime(df["dt"], errors="coerce")
    valid_count = df["dt"].notna().sum()
    total_count = len(df)
    df = df.dropna(subset=["dt"])

    if df.empty:
        raise ValueError(
            f"유효한 날짜 데이터가 없습니다. "
            f"(전체 {total_count}행 중 날짜 파싱 성공 0행)"
        )

    if df["dt"].dt.tz is not None:
        df["dt"] = df["dt"].dt.tz_localize(None)

    df = df.sort_values("dt")

    # 파일명에서 라인/재배사 감지
    filename = os.path.basename(file_path)
    line_id, room_id = _detect_room_line(filename)

    # 배치 시작 시간 (첫날 16:00)
    first_date = df["dt"].iloc[0].normalize()
    batch_start_time = first_date + timedelta(hours=16)

    # ★ 메모리 최적화: 리샘플 전에 날짜 범위 필터 수행
    start_buffer = batch_start_time - timedelta(hours=2)
    end_buffer = batch_start_time + timedelta(days=6, hours=23)
    df = df[(df["dt"] >= start_buffer) & (df["dt"] <= end_buffer)].copy()

    if df.empty:
        raise ValueError(
            f"지정 기간({start_buffer.strftime('%Y-%m-%d')} ~ "
            f"{end_buffer.strftime('%Y-%m-%d')})에 데이터가 없습니다."
        )

    # GC: 원본 데이터 해제
    gc.collect()

    # ★ 필터링된 데이터만 리샘플 (메모리 절감: 최대 ~10,000행)
    df = df.set_index("dt")
    df = df.resample("1min").mean()
    df = df.interpolate(method="linear", limit=180)
    df = df.reset_index()

    # Day_Index 계산
    base_day = batch_start_time.replace(hour=0, minute=0, second=0, microsecond=0)
    df["Day_Index"] = df["dt"].apply(lambda x: (x - base_day).days + 1)

    return df, room_id, line_id, batch_start_time


def _detect_room_line(filename):
    """파일명에서 라인 번호와 재배사 번호를 감지한다."""
    line_match = re.search(r"(\d+)라인", filename)
    if line_match:
        line_id = int(line_match.group(1))
        room_id = (line_id + 1) // 2
        return line_id, room_id

    room_match = re.search(r"(\d+)재배사", filename)
    room_id = int(room_match.group(1)) if room_match else 1
    return 1, room_id
