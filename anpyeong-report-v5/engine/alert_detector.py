"""
이상 감지 모듈.

센서 데이터에서 임계값 초과 구간을 탐지하고,
연속 구간(10분 이내 갭은 동일 이벤트)으로 묶어 로그를 생성한다.
"""

import pandas as pd
from datetime import timedelta


def detect_intervals(df_day, date_str, col_name, threshold, alert_type, unit):
    """
    일일 데이터에서 임계값 초과 구간을 탐지한다.

    Parameters
    ----------
    df_day : pd.DataFrame
        'dt' 컬럼을 포함한 일별 데이터
    date_str : str
        날짜 문자열 (로그 기록용)
    col_name : str
        감지 대상 컬럼명
    threshold : float
        임계값
    alert_type : str
        경고 유형 레이블 (예: '품온 고온', 'CO2 과다')
    unit : str
        단위 문자열 (예: '℃', 'ppm')

    Returns
    -------
    tuple : (event_count: int, log_list: list[dict])
        이벤트 횟수와 상세 로그 목록
    """
    if col_name not in df_day.columns:
        return 0, []

    bad_df = df_day[df_day[col_name] >= threshold].copy()
    if bad_df.empty:
        return 0, []

    # 10분 이상 갭이 있으면 별도 이벤트로 분리
    bad_df["grp"] = (bad_df["dt"].diff() > timedelta(minutes=10)).cumsum()
    event_count = bad_df["grp"].nunique()

    log_list = []
    for _, group in bad_df.groupby("grp"):
        max_val = group[col_name].max()
        if "CO2" in alert_type:
            max_display = f"{int(max_val)}{unit}"
        else:
            max_display = f"{round(max_val, 2)}{unit}"

        log_list.append({
            "날짜": date_str,
            "경고유형": alert_type,
            "시작시각": group["dt"].iloc[0].strftime("%H:%M"),
            "종료시각": group["dt"].iloc[-1].strftime("%H:%M"),
            "지속시간": f"{len(group)}분",
            "최대치": max_display,
        })

    return event_count, log_list
