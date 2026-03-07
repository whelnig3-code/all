"""
종합 의견 자동 생성 도메인 서비스.

안평리 engine/commentary.py 에서 이식 (로직 동일).
"""

import re

import pandas as pd


def build_commentary(start_date_str, end_date_str, daily_df, df_alert):
    """
    종합 의견 문자열을 생성한다.
    """
    total_warn_prod = _safe_sum(daily_df, "경고_품온")
    total_warn_co2 = _safe_sum(daily_df, "경고_CO2")

    focus_lines = []
    focus_lines.extend(_top_warn_days(daily_df, "경고_품온", "품온"))
    focus_lines.extend(_top_warn_days(daily_df, "경고_CO2", "CO₂"))

    major_issues = _extract_major_issues(df_alert)

    lines = []
    lines.append("[종합 판단]")
    if total_warn_prod == 0 and total_warn_co2 == 0:
        lines.append(
            "분석 기간 동안 품온 및 CO₂ 경고는 관측되지 않아 "
            "전반적으로 안정적으로 운영된 것으로 판단됩니다."
        )
    else:
        lines.append(
            f"분석 기간({start_date_str} ~ {end_date_str}) 동안 경고가 관측되었습니다. "
            f"품온 경고 {total_warn_prod}회, CO₂ 경고 {total_warn_co2}회로 집계됩니다."
        )

    lines.append("")
    lines.append("[주요 관찰]")
    if focus_lines:
        lines.extend(focus_lines)
    else:
        lines.append("- 경고는 특정 일자에 집중되는 패턴은 뚜렷하지 않았습니다.")

    if major_issues:
        lines.append("")
        lines.append("[30분 이상 지속 주요 이슈]")
        lines.extend(major_issues)

    return "\n".join(lines)


def _safe_sum(df, col):
    if col not in df.columns:
        return 0
    return int(df[col].fillna(0).sum())


def _top_warn_days(daily_df, col, label):
    if col not in daily_df.columns:
        return []
    results = []
    top = daily_df.sort_values(col, ascending=False).head(2)
    for _, r in top.iterrows():
        cnt = int(r.get(col, 0) or 0)
        if cnt > 0:
            results.append(f"- {label} 경고 집중: {r['날짜']} ({cnt}회)")
    return results


def _parse_minutes(x):
    if x is None:
        return 0
    m = re.search(r"(\d+)", str(x))
    return int(m.group(1)) if m else 0


def _extract_major_issues(df_alert):
    if df_alert is None or df_alert.empty:
        return []
    df_tmp = df_alert.copy()
    df_tmp["지속분"] = df_tmp["지속시간"].apply(_parse_minutes)
    df_major = df_tmp[df_tmp["지속분"] >= 30].sort_values("지속분", ascending=False).head(5)
    issues = []
    for _, r in df_major.iterrows():
        issues.append(
            f"- [{r['날짜']} {r['시작시각']}~{r['종료시각']}] "
            f"{r['경고유형']} (지속 {r['지속시간']}, 최대 {r['최대치']})"
        )
    return issues
