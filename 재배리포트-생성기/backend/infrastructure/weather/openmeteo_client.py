"""
Open-Meteo 날씨 데이터 클라이언트.

수남리 고유: 파일에 외부기온 데이터가 없을 때만 호출된다.

Meteostat 대비 장점:
  - 최근 데이터 즉시 사용 가능 (Meteostat는 수주 지연)
  - API 키 불필요
  - archive API (과거) + forecast API (최근 수일) 자동 전환
"""

import logging
from datetime import datetime, timedelta

import pandas as pd

logger = logging.getLogger("sunamri")

# 수남리 기본 좌표 (이천) - pipeline.py에서 인수로 전달받음
_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def fetch_weather(batch_start_time: datetime, lat: float, lon: float,
                  timeout: int = 10) -> tuple:
    """
    배치 기간의 날씨 데이터를 Open-Meteo에서 가져온다.

    archive API(과거)와 forecast API(최근)를 자동 선택하여
    최신 데이터도 즉시 조회한다.

    Parameters
    ----------
    batch_start_time : datetime
        배치 시작 시각
    lat, lon : float
        관측 좌표
    timeout : int
        HTTP 요청 타임아웃 (초)

    Returns
    -------
    tuple : (weather_daily: dict, weather_hourly: pd.DataFrame)
        weather_daily  : {날짜: {min, max, avg}}
        weather_hourly : DataFrame(dt, 외부기온(℃))
    """
    try:
        import requests
    except ImportError:
        logger.warning("requests 라이브러리 없음 - Open-Meteo 사용 불가")
        return {}, pd.DataFrame()

    now = datetime.now()
    start_dt = batch_start_time - timedelta(days=1)
    end_dt = min(batch_start_time + timedelta(days=7), now)

    start_str = start_dt.strftime("%Y-%m-%d")
    end_str = end_dt.strftime("%Y-%m-%d")

    weather_hourly = pd.DataFrame()

    # ── 1차: archive API (과거 데이터) ────────────────────────
    try:
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": start_str,
            "end_date": end_str,
            "hourly": "temperature_2m",
            "timezone": "Asia/Seoul",
        }
        resp = requests.get(_ARCHIVE_URL, params=params, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()

        if "hourly" in data and data["hourly"].get("temperature_2m"):
            weather_hourly = _parse_hourly(data)
            logger.info(f"Open-Meteo archive: {len(weather_hourly)}건 확보")
    except Exception as e:
        logger.warning(f"Open-Meteo archive 실패: {e}")

    # ── 2차: forecast API (최근 수일 보완) ────────────────────
    # archive 데이터가 비어있거나 최근 배치 기간이 누락된 경우 보완
    if weather_hourly.empty or _has_recent_gap(weather_hourly, batch_start_time):
        try:
            days_ago = max(1, (now - batch_start_time).days + 2)
            past_days = min(days_ago, 16)  # Open-Meteo 최대 16일

            params2 = {
                "latitude": lat,
                "longitude": lon,
                "hourly": "temperature_2m",
                "past_days": past_days,
                "forecast_days": 1,
                "timezone": "Asia/Seoul",
            }
            resp2 = requests.get(_FORECAST_URL, params=params2, timeout=timeout)
            resp2.raise_for_status()
            data2 = resp2.json()

            if "hourly" in data2 and data2["hourly"].get("temperature_2m"):
                hourly2 = _parse_hourly(data2)
                if weather_hourly.empty:
                    weather_hourly = hourly2
                else:
                    # archive + forecast 병합 (최근 누락 보완)
                    weather_hourly = (
                        pd.concat([weather_hourly, hourly2])
                        .drop_duplicates("dt")
                        .sort_values("dt")
                        .reset_index(drop=True)
                    )
                logger.info(f"Open-Meteo forecast 보완 → 총 {len(weather_hourly)}건")
        except Exception as e:
            logger.warning(f"Open-Meteo forecast 실패: {e}")

    if weather_hourly.empty:
        logger.warning("Open-Meteo: 데이터를 가져오지 못했습니다.")
        return {}, pd.DataFrame()

    # ── 일별 통계 계산 ─────────────────────────────────────
    weather_daily = {}
    for date_str, group in weather_hourly.groupby(
        weather_hourly["dt"].dt.date.astype(str)
    ):
        temps = group["외부기온(℃)"].dropna()
        if not temps.empty:
            weather_daily[date_str] = {
                "min": round(float(temps.min()), 1),
                "max": round(float(temps.max()), 1),
                "avg": round(float(temps.mean()), 1),
            }

    logger.info(f"Open-Meteo 일별 통계 {len(weather_daily)}일치 완료")
    return weather_daily, weather_hourly


# ── 내부 유틸 ───────────────────────────────────────────────

def _parse_hourly(data: dict) -> pd.DataFrame:
    """Open-Meteo JSON 응답 → DataFrame(dt, 외부기온(℃))."""
    times = data["hourly"]["time"]
    temps = data["hourly"]["temperature_2m"]
    df = pd.DataFrame({
        "dt": pd.to_datetime(times),
        "외부기온(℃)": [float(t) if t is not None else float("nan") for t in temps],
    })
    df["dt"] = df["dt"].dt.tz_localize(None)
    return df


def _has_recent_gap(df: pd.DataFrame, batch_start_time: datetime) -> bool:
    """배치 시작일 기준으로 hourly 데이터가 24시간 이상 뒤처진 경우 True."""
    if df.empty:
        return True
    latest = df["dt"].max()
    required = pd.Timestamp(batch_start_time)
    return (required - latest).total_seconds() > 3600 * 24
