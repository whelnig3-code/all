"""
데이터 분석 모듈.

살수 이벤트별 분석(±1h 윈도우)과 일별 종합 분석을 수행한다.
"""

import numpy as np
import pandas as pd
from datetime import timedelta

from engine.alert_detector import detect_intervals


def safe_agg(series, method, is_co2=False):
    """
    시리즈 집계를 안전하게 수행한다.
    빈 시리즈, NaN, Inf 를 모두 처리한다.
    """
    if series.empty:
        return None
    val = getattr(series, method)()
    if pd.isna(val) or np.isinf(val):
        return None
    if is_co2:
        return int(round(val))
    return round(val, 2)


def analyze_events(df, events, config):
    """
    각 살수 이벤트에 대해 ±1h 윈도우 분석을 수행한다.

    Parameters
    ----------
    df : pd.DataFrame
        시계열 DataFrame
    events : list[dict]
        살수 이벤트 목록
    config : SproutConfig
        설정 객체

    Returns
    -------
    pd.DataFrame
        이벤트별 분석 결과
    """
    col_room = "재배사온도(℃)"
    col_prod = "품온(℃)"
    col_co2 = "CO2농도(ppm)"
    col_water = "살수온도(℃)"

    event_summary = []

    for ev in events:
        row = ev.copy()

        # 살수 중 품온 변화 (냉각 효과)
        df_slice = df[(df["dt"] >= ev["start_time"]) & (df["dt"] <= ev["end_time"])]
        row["Cooling_Delta"] = _calc_cooling_delta(df_slice, col_prod)

        # ±1h 환경 데이터
        df_env = df[
            (df["dt"] >= ev["start_time"] - timedelta(hours=1))
            & (df["dt"] <= ev["start_time"] + timedelta(hours=1))
        ]

        for col, prefix in [
            (col_room, "WinA_Room"),
            (col_prod, "WinA_Prod"),
            (col_co2, "WinA_CO2"),
        ]:
            is_co2 = (col == col_co2)
            if col in df_env.columns:
                row[f"{prefix}_Min"] = safe_agg(df_env[col], "min", is_co2)
                row[f"{prefix}_Max"] = safe_agg(df_env[col], "max", is_co2)
                row[f"{prefix}_Avg"] = safe_agg(df_env[col], "mean", is_co2)
            else:
                row[f"{prefix}_Min"] = None
                row[f"{prefix}_Max"] = None
                row[f"{prefix}_Avg"] = None

        # 살수 온도
        if col_water in df.columns and not df_slice.empty:
            row["Water_Min"] = safe_agg(df_slice[col_water], "min")
            row["Water_Max"] = safe_agg(df_slice[col_water], "max")
            row["Water_Avg"] = safe_agg(df_slice[col_water], "mean")
        else:
            row["Water_Min"] = None
            row["Water_Max"] = None
            row["Water_Avg"] = None

        event_summary.append(row)

    return pd.DataFrame(event_summary)


def analyze_daily(df, events, event_df, config):
    """
    일별 종합 분석을 수행한다.

    Parameters
    ----------
    df : pd.DataFrame
        시계열 DataFrame
    events : list[dict]
        살수 이벤트 목록
    event_df : pd.DataFrame
        이벤트별 분석 결과
    config : SproutConfig
        설정 객체

    Returns
    -------
    tuple : (daily_summary_df, daily_results_dict)
        daily_results_dict[day] = {
            'data': df_day,        # 차트용 전체 일별 데이터
            'logs': alert_logs,    # 경고 로그
            'raw_dt': raw_dt,      # 원본 시간 인덱스
            'events_df': day_evs,  # 해당일 이벤트
        }
    """
    col_room = "재배사온도(℃)"
    col_prod = "품온(℃)"
    col_co2 = "CO2농도(ppm)"
    col_water = "살수온도(℃)"
    col_ext = "외부기온(℃)"

    daily_summary = []
    daily_results = {}

    for day in range(1, 7):
        df_day = df[df["Day_Index"] == day].copy()
        if df_day.empty:
            continue

        target_date_str = df_day["dt"].dt.date.iloc[0].strftime("%Y-%m-%d")

        # 기준선 컬럼 추가
        df_day["Ref_Prod"] = config.THRESHOLDS["limit_prod"]
        df_day["Ref_CO2"] = config.THRESHOLDS["limit_co2"]

        # 전일 리인덱스 (00:00 ~ 23:59, 1분 간격)
        full_idx = pd.date_range(
            start=df_day["dt"].min().replace(hour=0, minute=0),
            end=df_day["dt"].min().replace(hour=23, minute=59),
            freq="1min",
            name="dt",
        )
        raw_dt = df_day["dt"].copy()
        df_day = (
            df_day.set_index("dt")
            .reindex(full_idx)
            .interpolate(method="linear", limit=120)
            .reset_index()
        )
        df_day["Time_Fraction"] = (
            df_day["dt"].dt.hour * 60 + df_day["dt"].dt.minute
        ) / 1440.0

        # 마커 컬럼 초기화
        markers = ["Room", "Prod", "Ext", "CO2", "Water"]
        cols_data = {
            "Room": col_room,
            "Prod": col_prod,
            "Ext": col_ext,
            "CO2": col_co2,
            "Water": col_water,
        }
        for m in markers:
            df_day[f"Mark_{m}_Start"] = np.nan
            df_day[f"Mark_{m}_End"] = np.nan

        # 살수 이벤트 마커 배치
        current_day_events = [e for e in events if e["day_index"] == day]
        df_day["상태"] = ""

        for ev in current_day_events:
            mask = (df_day["dt"] >= ev["start_time"]) & (df_day["dt"] <= ev["end_time"])
            df_day.loc[mask, "상태"] = "살수중"
            for m, col in cols_data.items():
                if col in df_day.columns:
                    start_mask = df_day["dt"] == ev["start_time"]
                    end_mask = df_day["dt"] == ev["end_time"]
                    df_day.loc[start_mask, f"Mark_{m}_Start"] = df_day.loc[start_mask, col]
                    df_day.loc[end_mask, f"Mark_{m}_End"] = df_day.loc[end_mask, col]

        # 일별 통계
        row_daily = {"day_index": day, "date": target_date_str}

        # 외부기온
        if col_ext in df_day.columns:
            row_daily["Ext_Min"] = safe_agg(df_day[col_ext], "min")
            row_daily["Ext_Max"] = safe_agg(df_day[col_ext], "max")
            row_daily["Ext_Avg"] = safe_agg(df_day[col_ext], "mean")
        else:
            row_daily["Ext_Min"] = None
            row_daily["Ext_Max"] = None
            row_daily["Ext_Avg"] = None

        # 살수 이벤트 집계
        if not event_df.empty:
            day_evs = event_df[event_df["day_index"] == day]
            row_daily["event_count"] = len(day_evs)
            for wcol in ["Water_Min", "Water_Max", "Water_Avg"]:
                if wcol in day_evs.columns:
                    row_daily[wcol] = safe_agg(day_evs[wcol], "mean")
            if "Water_Avg" in day_evs.columns:
                row_daily["Daily_Water_Avg"] = row_daily.get("Water_Avg")
        else:
            day_evs = pd.DataFrame()
            row_daily["event_count"] = 0
            row_daily["Water_Min"] = None
            row_daily["Water_Max"] = None
            row_daily["Water_Avg"] = None

        # 센서 통계
        if col_room in df_day.columns:
            row_daily["Room_Min"] = safe_agg(df_day[col_room], "min")
            row_daily["Room_Max"] = safe_agg(df_day[col_room], "max")
            row_daily["Room_Avg"] = safe_agg(df_day[col_room], "mean")
        if col_prod in df_day.columns:
            row_daily["Prod_Min"] = safe_agg(df_day[col_prod], "min")
            row_daily["Prod_Max"] = safe_agg(df_day[col_prod], "max")
            row_daily["Prod_Avg"] = safe_agg(df_day[col_prod], "mean")
        if col_co2 in df_day.columns:
            row_daily["CO2_Min"] = safe_agg(df_day[col_co2], "min", True)
            row_daily["CO2_Max"] = safe_agg(df_day[col_co2], "max", True)
            row_daily["CO2_Avg"] = safe_agg(df_day[col_co2], "mean", True)

        # 경고 판정
        room_max = row_daily.get("Room_Max")
        room_min = row_daily.get("Room_Min")
        if room_max is not None and room_min is not None:
            row_daily["Warn_Room"] = (
                1 if (room_max - room_min) >= config.THRESHOLDS["swing_room"] else 0
            )
        else:
            row_daily["Warn_Room"] = 0

        cnt_prod, logs_prod = detect_intervals(
            df_day, target_date_str, col_prod,
            config.THRESHOLDS["limit_prod"], "품온 고온", "℃",
        )
        cnt_co2, logs_co2 = detect_intervals(
            df_day, target_date_str, col_co2,
            config.THRESHOLDS["limit_co2"], "CO2 과다", "ppm",
        )
        row_daily["Warn_Prod"] = cnt_prod
        row_daily["Warn_CO2"] = cnt_co2

        daily_summary.append(row_daily)
        daily_results[day] = {
            "data": df_day,
            "logs": logs_prod + logs_co2,
            "raw_dt": raw_dt,
            "events_df": day_evs if not event_df.empty else pd.DataFrame(),
        }

    return pd.DataFrame(daily_summary), daily_results


def _calc_cooling_delta(df_slice, col_prod):
    """살수 구간 내 품온 최대-최소 차이(냉각 효과)를 계산한다."""
    if df_slice.empty or col_prod not in df_slice.columns:
        return 0.0
    max_t = df_slice[col_prod].max()
    min_t = df_slice[col_prod].min()
    if pd.notnull(max_t) and pd.notnull(min_t):
        return round(max_t - min_t, 2)
    return 0.0
