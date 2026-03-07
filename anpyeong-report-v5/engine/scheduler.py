"""
살수 스케줄 생성 모듈.

재배사별 정해진 시간표에 따라 살수 이벤트 목록을 생성한다.
집수정 온도에 따라 살수 시간(45분/50분)을 결정하고,
라인 순서에 따른 순차 살수 오프셋을 적용한다.
"""

import pandas as pd
from datetime import timedelta


def generate_schedule(df, room_id, line_id, batch_start_time,
                      room_schedules, default_hours):
    """
    살수 이벤트 스케줄을 생성한다.

    Parameters
    ----------
    df : pd.DataFrame
        시계열 DataFrame ('dt', '집수정온도(℃)' 포함)
    room_id : int
        재배사 번호
    line_id : int
        라인 번호
    batch_start_time : datetime
        배치 시작 시간
    room_schedules : dict
        재배사별 살수 시간 스케줄
    default_hours : list
        기본 시간 스케줄

    Returns
    -------
    list[dict]
        이벤트 목록
    """
    base_date = batch_start_time.normalize()
    target_hours = room_schedules.get(room_id, default_hours)
    is_first_line = (line_id % 2 != 0)

    event_list = []

    for day_idx in range(1, 7):
        curr_date = base_date + timedelta(days=day_idx - 1)

        for i, h in enumerate(target_hours):
            event_no = i + 1
            base_start_dt = curr_date.replace(hour=h, minute=0, second=0)

            if base_start_dt < batch_start_time:
                continue

            # 집수정 온도 기반 살수 시간 결정
            sump_temp = _get_nearest_sump_temp(df, base_start_dt)
            duration = 50 if sump_temp >= 15.0 else 45

            # 순차 살수: 홀수 라인 먼저, 짝수 라인은 duration 후 시작
            if is_first_line:
                real_start_dt = base_start_dt
            else:
                real_start_dt = base_start_dt + timedelta(minutes=duration)

            real_end_dt = real_start_dt + timedelta(minutes=duration)

            event_list.append({
                "event_id": f"{day_idx}일차-{event_no}회",
                "day_index": day_idx,
                "event_no": event_no,
                "start_time": real_start_dt,
                "end_time": real_end_dt,
                "date_only": real_start_dt.strftime("%Y-%m-%d"),
                "start_time_only": real_start_dt.strftime("%H:%M"),
                "end_time_only": real_end_dt.strftime("%H:%M"),
                "duration_min": duration,
                "Sump_Temp": sump_temp,
            })

    return event_list


def _get_nearest_sump_temp(df, target_dt):
    """
    target_dt에 가장 가까운 시점의 집수정 온도를 반환한다.
    60분 이내에 데이터가 없으면 0.0을 반환한다.
    """
    col = "집수정온도(℃)"
    if col not in df.columns or df.empty:
        return 0.0

    time_diff = (df["dt"] - target_dt).abs()
    nearest_idx = time_diff.idxmin()

    if time_diff[nearest_idx] > timedelta(minutes=60):
        return 0.0

    val = df.loc[nearest_idx, col]
    return 0.0 if pd.isna(val) else float(val)
