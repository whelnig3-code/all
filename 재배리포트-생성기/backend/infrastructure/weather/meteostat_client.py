"""
Meteostat 날씨 데이터 클라이언트.

수남리 고유: 파일에 외부기온 데이터가 없을 때만 호출된다.
안평리는 Meteostat를 사용하지 않음.
"""

import socket
import logging
from datetime import timedelta

import pandas as pd

logger = logging.getLogger("sunamri")

try:
    from meteostat import Hourly, Point, Daily
    METEOSTAT_AVAILABLE = True
except ImportError:
    METEOSTAT_AVAILABLE = False
    logger.warning("meteostat 라이브러리 없음 - 날씨 데이터 API 사용 불가")


def fetch_weather(batch_start_time, station_id, lat, lon, alt, timeout=5):
    """
    배치 기간의 날씨 데이터를 Meteostat에서 가져온다.

    Parameters
    ----------
    batch_start_time : datetime
    station_id : str
        기상 관측소 ID (예: '47203' = 이천)
    lat, lon, alt : float
        관측소 좌표 (폴백용)
    timeout : int
        소켓 타임아웃 (초)

    Returns
    -------
    tuple : (weather_daily: dict, weather_hourly: pd.DataFrame)
        weather_daily: {날짜: {min, max, avg}}
        weather_hourly: DataFrame(dt, 외부기온(℃))
    """
    if not METEOSTAT_AVAILABLE:
        return {}, pd.DataFrame()

    socket.setdefaulttimeout(timeout)

    try:
        from datetime import datetime
        now = datetime.now()
        search_end = min(now, batch_start_time + timedelta(days=7))
        start = batch_start_time - timedelta(days=1)

        weather_daily = {}
        weather_hourly = pd.DataFrame()

        # 일별 데이터
        data_d = Daily(station_id, start, search_end).fetch()
        if data_d.empty:
            data_d = Daily(Point(lat, lon, alt), start, search_end).fetch()

        if not data_d.empty:
            for idx, row in data_d.iterrows():
                if pd.isna(row.get("tmin")):
                    continue
                weather_daily[idx.strftime("%Y-%m-%d")] = {
                    "min": round(row["tmin"], 1),
                    "max": round(row["tmax"], 1),
                    "avg": round(row["tavg"], 1),
                }

        # 시간별 데이터
        data_h = Hourly(station_id, start, search_end).fetch()
        if data_h.empty:
            data_h = Hourly(Point(lat, lon, alt), start, search_end).fetch()

        if not data_h.empty:
            data_h.index = data_h.index + timedelta(hours=9)  # UTC → KST
            weather_hourly = (
                data_h.reset_index()[["time", "temp"]]
                .rename(columns={"time": "dt", "temp": "외부기온(℃)"})
            )
            weather_hourly["dt"] = weather_hourly["dt"].dt.tz_localize(None)
            logger.info(f"Meteostat 시간별 날씨 {len(weather_hourly)}건 확보")
        else:
            logger.warning("Meteostat 시간별 날씨 데이터 없음")

        return weather_daily, weather_hourly

    except Exception as e:
        logger.warning(f"Meteostat 조회 실패: {e}")
        return {}, pd.DataFrame()
