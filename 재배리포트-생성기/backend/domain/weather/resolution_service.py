"""
날씨 데이터 해석 도메인 서비스.

수남리 고유: 파일에 외부기온 컬럼이 있으면 우선 사용,
없거나 데이터가 비어있으면 Meteostat API에서 가져온다.

안평리는 파일 컬럼만 사용 (Meteostat 없음).
"""

from enum import Enum

import pandas as pd


class WeatherSource(Enum):
    FILE = "file"       # 파일에 외부기온 데이터 있음
    API = "api"         # Meteostat API에서 가져와야 함
    NONE = "none"       # 날씨 데이터 없음


# 외부기온으로 인식할 컬럼명 패턴 (이미 header_mapper에서 표준화됐으면 '외부기온(℃)')
_WEATHER_COL = "외부기온(℃)"
_MIN_VALID_ROWS = 10  # 유효 데이터 최소 행 수


def resolve_weather_source(df: pd.DataFrame) -> tuple[WeatherSource, str | None]:
    """
    DataFrame에서 날씨 데이터 소스를 결정한다.

    Parameters
    ----------
    df : pd.DataFrame
        header_mapper 처리 후의 표준화된 DataFrame

    Returns
    -------
    tuple[WeatherSource, str | None]
        (소스 종류, 사용할 컬럼명 or None)
    """
    if _WEATHER_COL in df.columns:
        valid_count = df[_WEATHER_COL].notna().sum()
        if valid_count >= _MIN_VALID_ROWS:
            return WeatherSource.FILE, _WEATHER_COL

    return WeatherSource.API, None


def merge_weather_into_daily(df_day: pd.DataFrame, weather_hourly: pd.DataFrame,
                              weather_daily: dict, target_date_str: str) -> pd.DataFrame:
    """
    일별 DataFrame에 날씨 데이터를 병합한다.

    파일 소스인 경우 df_day에 이미 컬럼이 있으므로 그대로 반환.
    API 소스인 경우 시간별 → 일별 순서로 병합.

    Parameters
    ----------
    df_day : pd.DataFrame
        1분 간격으로 리인덱스된 일별 데이터
    weather_hourly : pd.DataFrame
        Meteostat 시간별 데이터 (columns: dt, 외부기온(℃))
    weather_daily : dict
        날짜 → {min, max, avg} 딕셔너리
    target_date_str : str
        처리 대상 날짜 문자열 ('YYYY-MM-DD')

    Returns
    -------
    pd.DataFrame
        외부기온(℃) 컬럼이 추가된 DataFrame
    """
    from datetime import timedelta

    if _WEATHER_COL in df_day.columns and df_day[_WEATHER_COL].notna().sum() >= _MIN_VALID_ROWS:
        # 파일에서 온 데이터 - 이미 있으므로 그대로
        return df_day

    # API 데이터 병합
    if not weather_hourly.empty:
        # tz-aware인 경우만 tz 제거 (tz-naive에서 tz_localize(None) 호출하면 TypeError)
        if df_day["dt"].dt.tz is not None:
            df_day["dt"] = df_day["dt"].dt.tz_localize(None)
        # merge_asof 전 기존 NaN 컬럼 제거:
        # df_day에 이미 all-NaN 외부기온(℃) 컬럼이 있으면
        # merge_asof가 _x/_y suffix를 붙여 컬럼 충돌이 생김
        if _WEATHER_COL in df_day.columns:
            df_day = df_day.drop(columns=[_WEATHER_COL])
        df_day = pd.merge_asof(
            df_day.sort_values("dt"),
            weather_hourly.sort_values("dt"),
            on="dt",
            direction="nearest",
            tolerance=timedelta(minutes=59),
        )

    if _WEATHER_COL not in df_day.columns:
        df_day[_WEATHER_COL] = None

    # 시간별 데이터로 못 채운 구간은 일별 평균으로 채움
    if target_date_str in weather_daily:
        daily_avg = weather_daily[target_date_str].get("avg", 0.0)
        df_day[_WEATHER_COL] = df_day[_WEATHER_COL].fillna(daily_avg)

    return df_day
