"""
살수 스케줄 도메인 서비스.

수남리 고유 로직:
  - 라인 개념 없음 (안평리와 다름)
  - 살수 시작 시각: 정각 + 1분 (xx:01)
  - 살수 시간: 시루(트레이) 개수 기반 계산
  - 날씨 데이터 연동 없음 (안평리의 집수정온도 기반 방식과 다름)
"""

from datetime import timedelta


def generate_schedule(batch_start_time, room_id, n_trays, room_schedules, default_hours, config):
    """
    살수 이벤트 스케줄을 생성한다.

    Parameters
    ----------
    batch_start_time : datetime
        배치 시작 시간
    room_id : int
        재배사 번호 (1~8)
    n_trays : int
        시루(트레이) 개수 (10~20)
    room_schedules : dict
        재배사별 살수 시간 스케줄
    default_hours : list
        기본 시간 스케줄
    config : SunamriConfig
        설정 객체

    Returns
    -------
    list[dict]
        이벤트 목록
    """
    base_date = batch_start_time.normalize()
    target_hours = room_schedules.get(room_id, default_hours)
    duration = config.calculate_duration(n_trays)

    event_list = []

    for day_idx in range(1, 7):
        curr_date = base_date + timedelta(days=day_idx - 1)

        for i, h in enumerate(target_hours):
            event_no = i + 1
            # 수남리: 정각 + 1분에 살수 시작
            start_dt = curr_date.replace(hour=h, minute=1, second=0)

            if start_dt < batch_start_time:
                continue

            end_dt = start_dt + timedelta(minutes=duration)

            event_list.append({
                "event_id": f"{day_idx}일차-{event_no}회",
                "day_index": day_idx,
                "event_no": event_no,
                "start_time": start_dt,
                "end_time": end_dt,
                "date_only": start_dt.strftime("%Y-%m-%d"),
                "start_time_only": start_dt.strftime("%H:%M"),
                "end_time_only": end_dt.strftime("%H:%M"),
                "duration_min": duration,
            })

    return event_list
