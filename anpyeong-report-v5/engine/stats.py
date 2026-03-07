"""
통계 요약 모듈.

파이프라인 분석 결과를 JSON 및 CSV 형식으로 요약한다.
v5.2에서 추가됨.
"""

import csv
import json
import logging
import os
from datetime import datetime
from itertools import groupby

import numpy as np
import pandas as pd

logger = logging.getLogger("anpyeong")

_SENSOR_COLUMNS = [
    "재배사온도(℃)",
    "품온(℃)",
    "CO2농도(ppm)",
    "살수온도(℃)",
    "집수정온도(℃)",
    "외부기온(℃)",
]


def compute_summary_stats(df, events, event_df, daily_df, daily_results):
    """
    전체 통계 요약 딕셔너리를 생성한다.

    Parameters
    ----------
    df : pd.DataFrame
        시계열 DataFrame (dt 컬럼 포함)
    events : list[dict]
        살수 이벤트 목록
    event_df : pd.DataFrame
        이벤트별 분석 결과
    daily_df : pd.DataFrame
        일별 요약
    daily_results : dict
        일별 상세 결과

    Returns
    -------
    dict
    """
    summary = {}

    # 1. 전체 기간
    if not df.empty and "dt" in df.columns:
        summary["전체_기간"] = {
            "시작": df["dt"].min().strftime("%Y-%m-%d %H:%M"),
            "종료": df["dt"].max().strftime("%Y-%m-%d %H:%M"),
        }
    else:
        summary["전체_기간"] = {"시작": "-", "종료": "-"}

    # 2. 샘플 수
    summary["샘플_수"] = len(df)

    # 3. 센서별 통계
    sensor_stats = {}
    for col in _SENSOR_COLUMNS:
        if col in df.columns:
            series = df[col].dropna()
            total = len(df)
            missing = total - len(series)
            sensor_stats[col] = {
                "평균": _safe_round(series.mean()),
                "최소": _safe_round(series.min()),
                "최대": _safe_round(series.max()),
                "표준편차": _safe_round(series.std()),
                "결측률(%)": round(missing / total * 100, 2) if total > 0 else 0.0,
            }
        else:
            sensor_stats[col] = {
                "평균": None, "최소": None, "최대": None,
                "표준편차": None, "결측률(%)": 100.0,
            }
    summary["센서_통계"] = sensor_stats

    # 4. 살수 이벤트 통계
    summary["살수_통계"] = _compute_event_stats(events, daily_df)

    # 5. 경고 카운트
    summary["경고_카운트"] = _compute_alert_counts(daily_df, daily_results)

    # 6. 생성 시각
    summary["생성_시각"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 7. 보안
    summary["security"] = {
        "classification": "내부전용",
        "owner": "농업회사법인 재우",
        "notice": "본 문서는 농업회사법인 재우의 자산입니다. 무단 복제 및 외부 공유를 금합니다.",
    }

    return summary


def write_summary_files(summary, report_dir):
    """
    요약 통계를 JSON과 CSV 파일로 저장한다.

    Returns
    -------
    tuple[str, str]
        (json_path, csv_path)
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    json_path = os.path.join(report_dir, f"summary_{timestamp}.json")
    csv_path = os.path.join(report_dir, f"summary_{timestamp}.csv")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2, default=str)

    _write_summary_csv(summary, csv_path)

    logger.info(f"통계 요약 저장: {os.path.basename(json_path)}, {os.path.basename(csv_path)}")
    return json_path, csv_path


# ─── 내부 함수 ────────────────────────────────────────

def _safe_round(val, digits=2):
    if val is None or pd.isna(val) or np.isinf(val):
        return None
    return round(float(val), digits)


def _compute_event_stats(events, daily_df):
    if not events:
        return {
            "살수_횟수_일": 0,
            "살수_간격_평균_분": None,
            "살수_간격_최소_분": None,
            "살수_간격_최대_분": None,
        }

    days_with_events = len(set(e["day_index"] for e in events))
    avg_per_day = round(len(events) / max(days_with_events, 1), 1)

    # 같은 날짜 내 연속 이벤트 간 시작시간 차이
    intervals = []
    sorted_events = sorted(events, key=lambda e: (e["day_index"], e["start_time"]))
    for _, group in groupby(sorted_events, key=lambda e: e["day_index"]):
        day_events = list(group)
        for i in range(1, len(day_events)):
            delta = (day_events[i]["start_time"] - day_events[i - 1]["start_time"]).total_seconds() / 60
            intervals.append(delta)

    return {
        "살수_횟수_일": avg_per_day,
        "살수_간격_평균_분": _safe_round(np.mean(intervals)) if intervals else None,
        "살수_간격_최소_분": _safe_round(np.min(intervals)) if intervals else None,
        "살수_간격_최대_분": _safe_round(np.max(intervals)) if intervals else None,
    }


def _compute_alert_counts(daily_df, daily_results):
    counts = {"경고": 0, "위험": 0, "데이터부족": 0}

    for col in ["Warn_Room", "Warn_Prod", "Warn_CO2"]:
        if col in daily_df.columns:
            counts["경고"] += int(daily_df[col].fillna(0).sum())

    for col in ["Warn_Prod", "Warn_CO2"]:
        if col in daily_df.columns:
            counts["위험"] += int((daily_df[col].fillna(0) > 5).sum())

    expected_days = 6
    actual_days = len(daily_results)
    counts["데이터부족"] = max(0, expected_days - actual_days)

    return counts


def _write_summary_csv(summary, csv_path):
    rows = []
    rows.append(["기간_시작", summary["전체_기간"]["시작"]])
    rows.append(["기간_종료", summary["전체_기간"]["종료"]])
    rows.append(["샘플_수", summary["샘플_수"]])
    rows.append([])

    rows.append(["센서", "평균", "최소", "최대", "표준편차", "결측률(%)"])
    for sensor, stats in summary["센서_통계"].items():
        rows.append([
            sensor, stats["평균"], stats["최소"], stats["최대"],
            stats["표준편차"], stats["결측률(%)"],
        ])

    rows.append([])
    rows.append(["살수_횟수_일", summary["살수_통계"]["살수_횟수_일"]])
    rows.append(["살수_간격_평균(분)", summary["살수_통계"]["살수_간격_평균_분"]])
    rows.append(["살수_간격_최소(분)", summary["살수_통계"]["살수_간격_최소_분"]])
    rows.append(["살수_간격_최대(분)", summary["살수_통계"]["살수_간격_최대_분"]])

    rows.append([])
    rows.append(["경고_합계", summary["경고_카운트"]["경고"]])
    rows.append(["위험_합계", summary["경고_카운트"]["위험"]])
    rows.append(["데이터부족", summary["경고_카운트"]["데이터부족"]])

    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
