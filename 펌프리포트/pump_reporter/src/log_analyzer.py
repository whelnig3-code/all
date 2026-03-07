"""v4.5: 감사 로그 분석 모듈.

logs/decision.log, data.log, system.log를 파싱하여 운영 통계 생성.
CLI 실행: python -m src.log_analyzer --month 2026-02
"""
import json
import calendar
import argparse
from datetime import datetime, date, timedelta
from pathlib import Path
from collections import defaultdict

from src.paths import LOG_DIR, DATA_DIR


# ── 유틸 ──────────────────────────────────────────────────────

def _load_jsonl(filepath: Path) -> list[dict]:
    """JSON Lines 파일 로드. 파일 없거나 디코드 에러 시 무시."""
    records = []
    if not filepath.exists():
        return records
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records


def _parse_ts(ts_str: str) -> datetime | None:
    """ISO 타임스탬프 → datetime. 실패 시 None."""
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str)
    except (ValueError, TypeError):
        return None


def _in_range(ts: datetime | None,
              start: datetime | None,
              end: datetime | None) -> bool:
    if ts is None:
        return False
    if start and ts < start:
        return False
    if end and ts > end:
        return False
    return True


def _date_set_in_range(start_date: str, end_date: str) -> set[str]:
    """start_date ~ end_date 사이 모든 날짜 문자열 집합."""
    if not start_date or not end_date:
        return set()
    d = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    dates = set()
    while d <= end:
        dates.add(d.isoformat())
        d += timedelta(days=1)
    return dates


# ── 함수 1: Decision Log 분석 ────────────────────────────────

def analyze_decision_logs(start_date: str = None,
                          end_date: str = None) -> dict:
    """decision.log 분석.

    Args:
        start_date: "YYYY-MM-DD" 시작일 (포함). None이면 제한 없음.
        end_date:   "YYYY-MM-DD" 종료일 (포함). None이면 제한 없음.

    Returns:
        {"summary": {...}, "by_pump": {...}}
    """
    records = _load_jsonl(LOG_DIR / "decision.log")
    if not records:
        return {"summary": _empty_summary(), "by_pump": {}}

    # 날짜 필터
    dt_start = _parse_ts(start_date + "T00:00:00") if start_date else None
    dt_end = _parse_ts(end_date + "T23:59:59") if end_date else None

    filtered = []
    for r in records:
        ts = _parse_ts(r.get("timestamp", ""))
        if _in_range(ts, dt_start, dt_end):
            filtered.append(r)

    if not filtered:
        return {"summary": _empty_summary(), "by_pump": {}}

    # ── 통계 집계 ─────────────────────────────────────────────
    category_dist = defaultdict(int)
    reason_dist = defaultdict(int)
    source_dist = defaultdict(int)
    confidence_vals = []
    coverage_vals = []
    forecast_used = 0
    rolling_warnings = 0
    deg_severe_count = 0
    low_confidence_count = 0
    low_conf_immediate = 0
    logged_dates: set[str] = set()
    by_pump: dict[str, list[dict]] = defaultdict(list)

    for r in filtered:
        cat = r.get("final_category", "정상")
        category_dist[cat] += 1

        reason = r.get("reason", "none")
        reason_dist[reason] += 1

        src = r.get("baseline_source", "none")
        source_dist[src] += 1

        bl_conf = r.get("baseline_confidence")
        if bl_conf is not None:
            conf_val = float(bl_conf)
            confidence_vals.append(conf_val)
            # (C) Confidence 왜곡 탐지
            if conf_val < 50:
                low_confidence_count += 1
                if cat == "즉시점검":
                    low_conf_immediate += 1

        cov = r.get("recent_coverage")
        if cov is not None:
            coverage_vals.append(float(cov))

        if r.get("forecast_months_left") is not None:
            forecast_used += 1

        if reason == "rolling":
            rolling_warnings += 1

        if reason == "deg_severe":
            deg_severe_count += 1

        # (A) 로그 날짜 수집
        ts_str = r.get("timestamp", "")[:10]
        if ts_str:
            logged_dates.add(ts_str)

        pump_id = r.get("pump_id", "unknown")
        by_pump[pump_id].append(r)

    total = len(filtered)

    # (A) 로그 무결성: 기간 내 누락일 계산
    expected_dates = _date_set_in_range(start_date, end_date)
    expected_days = len(expected_dates)
    actual_days = len(logged_dates & expected_dates) if expected_dates else len(logged_dates)
    missing_days = max(0, expected_days - actual_days)
    log_coverage_pct = round(actual_days / expected_days * 100, 1) if expected_days else 100.0

    summary = {
        "total_records": total,
        "period": {
            "start": start_date,
            "end": end_date,
        },
        "final_category_distribution": dict(category_dist),
        "reason_distribution": dict(reason_dist),
        "baseline_source_distribution": dict(source_dist),
        "avg_baseline_confidence": (
            round(sum(confidence_vals) / len(confidence_vals), 1)
            if confidence_vals else None
        ),
        "avg_recent_coverage": (
            round(sum(coverage_vals) / len(coverage_vals), 1)
            if coverage_vals else None
        ),
        "forecast_usage_pct": round(forecast_used / total * 100, 1) if total else 0,
        "rolling_warning_pct": round(rolling_warnings / total * 100, 1) if total else 0,
        "deg_severe_count": deg_severe_count,
        # (A) 로그 무결성
        "log_integrity": {
            "expected_days": expected_days,
            "actual_days_logged": actual_days,
            "missing_days": missing_days,
            "coverage_pct": log_coverage_pct,
        },
        # (C) Confidence 왜곡 탐지
        "low_confidence_pct": (
            round(low_confidence_count / len(confidence_vals) * 100, 1)
            if confidence_vals else 0
        ),
        "low_conf_immediate_count": low_conf_immediate,
    }

    # ── 펌프별 요약 ──────────────────────────────────────────
    pump_summary = {}
    for pid, recs in by_pump.items():
        degs = [r["degradation_pct"] for r in recs
                if r.get("degradation_pct") is not None]
        forecasts = [r["forecast_months_left"] for r in recs
                     if r.get("forecast_months_left") is not None]
        cats = [r.get("final_category", "정상") for r in recs]
        warning_days = sum(1 for c in cats if c in ("즉시점검", "교체계획", "예방정비"))

        # (B) 펌프별 로그 날짜
        pump_dates = {r.get("timestamp", "")[:10] for r in recs
                      if r.get("timestamp", "")[:10]}
        pump_log_days = len(pump_dates & expected_dates) if expected_dates else len(pump_dates)
        pump_completeness = (
            round(pump_log_days / expected_days * 100, 1)
            if expected_days else 100.0
        )

        pump_summary[pid] = {
            "record_count": len(recs),
            "avg_degradation_pct": round(sum(degs) / len(degs), 2) if degs else None,
            "max_degradation_pct": round(min(degs), 2) if degs else None,
            "avg_forecast_months": (
                round(sum(forecasts) / len(forecasts), 1) if forecasts else None
            ),
            "warning_days": warning_days,
            "category_distribution": dict(defaultdict(int, ((c, cats.count(c)) for c in set(cats)))),
            # (B) 펌프별 로그 완전성
            "log_days": pump_log_days,
            "log_completeness_pct": pump_completeness,
        }

    return {"summary": summary, "by_pump": pump_summary}


def _empty_summary() -> dict:
    return {
        "total_records": 0,
        "period": {"start": None, "end": None},
        "final_category_distribution": {},
        "reason_distribution": {},
        "baseline_source_distribution": {},
        "avg_baseline_confidence": None,
        "avg_recent_coverage": None,
        "forecast_usage_pct": 0,
        "rolling_warning_pct": 0,
        "deg_severe_count": 0,
        "log_integrity": {
            "expected_days": 0, "actual_days_logged": 0,
            "missing_days": 0, "coverage_pct": 0,
        },
        "low_confidence_pct": 0,
        "low_conf_immediate_count": 0,
    }


# ── 함수 2: FP Episode 분석 ──────────────────────────────────

def analyze_fp_episodes(start_date: str = None,
                        end_date: str = None) -> dict:
    """즉시점검 연속 구간(episode) 분석.

    같은 pump_id에서 final_category == "즉시점검"이 연속되는 구간을
    하나의 episode로 묶어 길이를 계산.

    Returns:
        {"episodes": [...], "total_episodes": int,
         "avg_episode_length": float, "max_episode_length": int}
    """
    records = _load_jsonl(LOG_DIR / "decision.log")

    dt_start = _parse_ts(start_date + "T00:00:00") if start_date else None
    dt_end = _parse_ts(end_date + "T23:59:59") if end_date else None

    # 펌프별 시계열 정렬
    by_pump: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        ts = _parse_ts(r.get("timestamp", ""))
        if _in_range(ts, dt_start, dt_end):
            by_pump[r.get("pump_id", "unknown")].append(r)

    episodes = []
    for pid, recs in by_pump.items():
        recs.sort(key=lambda x: x.get("timestamp", ""))
        current_ep = None
        for r in recs:
            is_critical = r.get("final_category") == "즉시점검"
            ts_str = r.get("timestamp", "")[:10]
            if is_critical:
                if current_ep is None:
                    current_ep = {"pump_id": pid, "start": ts_str,
                                  "end": ts_str, "length": 1}
                else:
                    current_ep["end"] = ts_str
                    current_ep["length"] += 1
            else:
                if current_ep is not None:
                    episodes.append(current_ep)
                    current_ep = None
        if current_ep is not None:
            episodes.append(current_ep)

    lengths = [e["length"] for e in episodes]
    return {
        "episodes": episodes,
        "total_episodes": len(episodes),
        "avg_episode_length": round(sum(lengths) / len(lengths), 1) if lengths else 0,
        "max_episode_length": max(lengths) if lengths else 0,
    }


# ── CLI ───────────────────────────────────────────────────────

def _print_summary(result: dict):
    """콘솔 요약 출력."""
    s = result["summary"]
    print("=" * 60)
    print("  Decision Log 분석 요약")
    print("=" * 60)
    print(f"  분석 건수        : {s['total_records']}")
    print(f"  기간             : {s['period']['start']} ~ {s['period']['end']}")
    print()

    # (A) 로그 무결성
    li = s["log_integrity"]
    print("  [로그 무결성]")
    print(f"    기대 일수      : {li['expected_days']}")
    print(f"    실제 기록 일수 : {li['actual_days_logged']}")
    print(f"    누락 일수      : {li['missing_days']}")
    print(f"    커버리지       : {li['coverage_pct']}%")
    print()

    print("  [카테고리 분포]")
    for cat in ("즉시점검", "교체계획", "예방정비", "정상"):
        cnt = s["final_category_distribution"].get(cat, 0)
        print(f"    {cat:8s} : {cnt}")
    print()
    print("  [Reason 분포]")
    for reason, cnt in sorted(s["reason_distribution"].items(),
                              key=lambda x: -x[1]):
        print(f"    {reason:16s} : {cnt}")
    print()
    print(f"  평균 Baseline Confidence : {s['avg_baseline_confidence']}")
    print(f"  평균 Recent Coverage     : {s['avg_recent_coverage']}")
    print(f"  Forecast 사용 비율       : {s['forecast_usage_pct']}%")
    print(f"  Rolling 기반 경고 비율   : {s['rolling_warning_pct']}%")
    print(f"  deg_severe 발생 횟수     : {s['deg_severe_count']}")
    # (C) Confidence 왜곡
    print(f"  낮은 Confidence 비율     : {s['low_confidence_pct']}%")
    print(f"  저신뢰+즉시점검 건수     : {s['low_conf_immediate_count']}")
    print()
    print(f"  [펌프별 요약] ({len(result['by_pump'])}개)")
    for pid, ps in sorted(result["by_pump"].items()):
        deg = ps["avg_degradation_pct"]
        deg_str = f"{deg:+.1f}%" if deg is not None else "N/A"
        fc = ps["avg_forecast_months"]
        fc_str = f"{fc:.1f}개월" if fc is not None else "N/A"
        # (B) 펌프별 완전성
        comp = ps.get("log_completeness_pct", 0)
        print(f"    {pid:16s} | 열화 {deg_str:>8s} | "
              f"예측 {fc_str:>8s} | 경고 {ps['warning_days']}일 | "
              f"로그 {comp:.0f}%")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Decision Log Analyzer")
    parser.add_argument("--month", type=str, default=None,
                        help="분석 월 (YYYY-MM). 미지정 시 전체.")
    parser.add_argument("--start", type=str, default=None,
                        help="시작일 (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, default=None,
                        help="종료일 (YYYY-MM-DD)")
    args = parser.parse_args()

    start_date = args.start
    end_date = args.end

    if args.month:
        # YYYY-MM → 해당 월 범위
        y, m = args.month.split("-")
        start_date = f"{y}-{m}-01"
        _, last_day = calendar.monthrange(int(y), int(m))
        end_date = f"{y}-{m}-{last_day:02d}"

    result = analyze_decision_logs(start_date, end_date)
    fp = analyze_fp_episodes(start_date, end_date)

    _print_summary(result)
    print()
    print(f"  FP Episodes: {fp['total_episodes']}건, "
          f"평균 {fp['avg_episode_length']}일, "
          f"최대 {fp['max_episode_length']}일")
    print()

    # JSON 저장
    cache_dir = DATA_DIR / "report_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    if args.month:
        filename = f"log_summary_{args.month.replace('-', '')}.json"
    else:
        filename = f"log_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    out_path = cache_dir / filename
    output = {
        "generated_at": datetime.now().isoformat(),
        "analysis": result,
        "fp_episodes": fp,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"  저장: {out_path}")


if __name__ == "__main__":
    main()
