"""
센서 데이터 분석 도메인 서비스.

살수 이벤트별 분석(±1h 윈도우)과 일별 종합 분석을 수행한다.

안평리 engine/analyzer.py 에서 이식.
수남리 고유 변경사항:
  - 살수온도를 지하수(GW) / 온수(Hot)로 분리 분석
  - 일별 GW/Hot 평균 집계
"""

import numpy as np
import pandas as pd
from datetime import timedelta

from domain.alert.detection_service import detect_intervals


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

    수남리 고유: 살수온도를 지하수(GW)와 온수(Hot)로 분리.
      - 지하수 구간: start_time ~ start_time + duration/3
      - 온수 구간: start_time + duration/2 ~ end_time
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

        # 수남리 고유: 살수온도 → 지하수(GW) / 온수(Hot) 분리 분석
        if col_water in df.columns and not df_slice.empty:
            duration = ev["duration_min"]
            cycle = duration / 6.0

            gw_end = ev["start_time"] + timedelta(minutes=cycle * 2)
            hot_start = ev["start_time"] + timedelta(minutes=cycle * 3)

            df_gw = df[(df["dt"] >= ev["start_time"]) & (df["dt"] < gw_end)]
            df_hot = df[(df["dt"] >= hot_start) & (df["dt"] <= ev["end_time"])]

            row["GW_Min"] = safe_agg(df_gw[col_water], "min")
            row["GW_Max"] = safe_agg(df_gw[col_water], "max")
            row["GW_Avg"] = safe_agg(df_gw[col_water], "mean")
            row["Hot_Min"] = safe_agg(df_hot[col_water], "min")
            row["Hot_Max"] = safe_agg(df_hot[col_water], "max")
            row["Hot_Avg"] = safe_agg(df_hot[col_water], "mean")
        else:
            for key in ["GW_Min", "GW_Max", "GW_Avg", "Hot_Min", "Hot_Max", "Hot_Avg"]:
                row[key] = None

        event_summary.append(row)

    return pd.DataFrame(event_summary)


def analyze_daily(df, events, event_df, config):
    """
    일별 종합 분석을 수행한다.

    Returns
    -------
    tuple : (daily_summary_df, daily_results_dict)
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
        # Ref 컬럼: reindex 후 설정해야 전체 1440행에 값이 채워짐
        # (reindex 전 설정 시 leading/trailing NaN 발생)
        df_day["Ref_Prod"] = config.THRESHOLDS["limit_prod"]
        df_day["Ref_CO2"] = config.THRESHOLDS["limit_co2"]

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

        row_daily = {"day_index": day, "date": target_date_str}

        if col_ext in df_day.columns:
            row_daily["Ext_Min"] = safe_agg(df_day[col_ext], "min")
            row_daily["Ext_Max"] = safe_agg(df_day[col_ext], "max")
            row_daily["Ext_Avg"] = safe_agg(df_day[col_ext], "mean")
        else:
            row_daily["Ext_Min"] = None
            row_daily["Ext_Max"] = None
            row_daily["Ext_Avg"] = None

        # 수남리 고유: GW/Hot 일별 평균
        if not event_df.empty:
            day_evs = event_df[event_df["day_index"] == day]
            row_daily["event_count"] = len(day_evs)
            if "GW_Avg" in day_evs.columns:
                row_daily["Daily_GW_Avg"] = safe_agg(day_evs["GW_Avg"], "mean")
            if "Hot_Avg" in day_evs.columns:
                row_daily["Daily_Hot_Avg"] = safe_agg(day_evs["Hot_Avg"], "mean")
        else:
            day_evs = pd.DataFrame()
            row_daily["event_count"] = 0
            row_daily["Daily_GW_Avg"] = None
            row_daily["Daily_Hot_Avg"] = None

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

        # 살수온도 일별 통계: 반드시 살수 이벤트 시간대에만 집계해야 함
        # (살수하지 않는 시간의 온도를 포함하면 통계가 왜곡됨)
        # 수남리: COL_MAP에서 _gw_unused로 매핑되어 최종 출력에선 미사용 (GW/Hot Avg 별도 집계)
        # 안평리: 살수온도_최저/최고/일평균으로 매핑되어 차트에 표시됨
        if col_water in df_day.columns and current_day_events:
            water_mask = pd.Series(False, index=df_day.index)
            for ev in current_day_events:
                water_mask |= (
                    (df_day["dt"] >= ev["start_time"]) &
                    (df_day["dt"] <= ev["end_time"])
                )
            df_water_events = df_day.loc[water_mask, col_water].dropna()
            if not df_water_events.empty:
                row_daily["Water_Min"] = safe_agg(df_water_events, "min")
                row_daily["Water_Max"] = safe_agg(df_water_events, "max")
                row_daily["Water_Avg"] = safe_agg(df_water_events, "mean")
            else:
                row_daily["Water_Min"] = None
                row_daily["Water_Max"] = None
                row_daily["Water_Avg"] = None
        elif col_water in df_day.columns and not current_day_events:
            # 해당 일에 살수 이벤트가 없으면 None
            row_daily["Water_Min"] = None
            row_daily["Water_Max"] = None
            row_daily["Water_Avg"] = None

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

        # 품온 / CO2 초과 시간 집계 (df_day는 1분 단위이므로 행 수 = 분)
        if col_prod in df_day.columns:
            exceed_min = int((df_day[col_prod] >= config.THRESHOLDS["limit_prod"]).sum())
            row_daily["Prod_Exceed_Min"] = exceed_min
        else:
            row_daily["Prod_Exceed_Min"] = 0

        if col_co2 in df_day.columns:
            exceed_min = int((df_day[col_co2] >= config.THRESHOLDS["limit_co2"]).sum())
            row_daily["CO2_Exceed_Min"] = exceed_min
        else:
            row_daily["CO2_Exceed_Min"] = 0

        # 주간(06:00~18:00) / 야간(18:00~06:00) 재배사 평균 온도
        if col_room in df_day.columns:
            hour = df_day["dt"].dt.hour
            day_mask   = (hour >= 6) & (hour < 18)
            night_mask = ~day_mask
            row_daily["Room_Day_Avg"]   = safe_agg(df_day.loc[day_mask,   col_room], "mean")
            row_daily["Room_Night_Avg"] = safe_agg(df_day.loc[night_mask, col_room], "mean")
        else:
            row_daily["Room_Day_Avg"]   = None
            row_daily["Room_Night_Avg"] = None

        daily_summary.append(row_daily)
        daily_results[day] = {
            "data": df_day,
            "logs": logs_prod + logs_co2,
            "raw_dt": raw_dt,
            "events_df": day_evs if not event_df.empty else pd.DataFrame(),
        }

    return pd.DataFrame(daily_summary), daily_results


def _calc_cooling_delta(df_slice, col_prod):
    if df_slice.empty or col_prod not in df_slice.columns:
        return 0.0
    max_t = df_slice[col_prod].max()
    min_t = df_slice[col_prod].min()
    if pd.notnull(max_t) and pd.notnull(min_t):
        return round(max_t - min_t, 2)
    return 0.0
