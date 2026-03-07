"""
수남리 Excel 리포트 생성 모듈.

표지, 대시보드, 일별 요약, 이벤트 상세, 일차별 차트, 종합 리포트 시트를 포함하는
완전한 Excel 리포트를 생성한다.

[안평리와의 주요 차이점]
- line_id 없음 (수남리는 라인 개념 없이 재배사만)
- 살수온도 → 지하수(GW) / 온수(Hot) 분리 차트
- 품온 임계값 28℃ → 27℃
- CO2 임계값 10,000ppm → 6,000ppm
- 배치 시작 감지 방식 다름 (CO2 > 1200 & hour >= 15)

[메모리 관리]
xlsxwriter 엔진 사용 (openpyxl 아님).
xlsxwriter는 스트리밍 방식으로 행 데이터를 디스크에 즉시 기록하여
메모리 사용이 적다. 일차별 시트 작성 후 해당 데이터를 즉시 해제한다.
"""

import gc
import logging
import os

import numpy as np
import pandas as pd

from domain.report.commentary_service import build_commentary

logger = logging.getLogger("sunamri")


# ─── 로고 경로 헬퍼 ───────────────────────────────────────────

def _get_logo_path():
    """
    assets/logo.png 경로를 반환한다.
    파일이 없으면 None을 반환한다.
    """
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    path = os.path.join(base, "assets", "logo.png")
    if os.path.isfile(path):
        return path
    logger.warning(f"로고 파일을 찾을 수 없습니다: {path}")
    return None


def build_report(event_df, daily_df, daily_results, events, config,
                 output_path, prod_date, room_id,
                 factory_name="수남리", line_id=None,
                 progress_callback=None):
    """
    전체 Excel 리포트를 생성한다.

    Parameters
    ----------
    event_df : pd.DataFrame
        이벤트별 분석 결과
    daily_df : pd.DataFrame
        일별 요약 결과
    daily_results : dict
        일별 상세 데이터 {day: {'data', 'logs', 'raw_dt', 'events_df'}}
    events : list[dict]
        살수 이벤트 목록
    config : SunamriConfig or AnpyeongConfig
        설정 객체
    output_path : str
        출력 파일 경로
    prod_date : datetime
        생산일
    room_id : int
        재배사 번호 (1~8)
    factory_name : str, optional
        공장명 (기본: "수남리"). 표지/종합 리포트에 표시.
    line_id : int or None, optional
        라인 번호 (안평리 전용). None이면 표시 안 함.
    progress_callback : callable, optional
        진행 콜백 (percent: int, message: str)

    Returns
    -------
    bool
        성공 여부

    Raises
    ------
    PermissionError
        파일이 열려 있어 쓸 수 없는 경우
    """
    # 컬럼 한글화
    event_df = event_df.replace([np.inf, -np.inf], np.nan).fillna("")
    daily_df = daily_df.replace([np.inf, -np.inf], np.nan).fillna("")

    event_df = event_df.rename(columns=config.COL_MAP)
    daily_df = daily_df.rename(columns=config.COL_MAP)
    event_df = event_df.drop(
        columns=["시작시각", "종료시각", "start_time", "end_time"], errors="ignore",
    )

    daily_df["Limit_Prod"] = config.THRESHOLDS["limit_prod"]
    daily_df["Limit_CO2"] = config.THRESHOLDS["limit_co2"]

    # 일별 요약 컬럼 정리
    # - 수남리: 지하수_일평균 / 온수_일평균 (GW/Hot 분리 방식)
    # - 안평리: 살수온도_최저 / 살수온도_최고 / 살수온도_일평균 (단일 온도)
    # final_day_cols 필터가 존재하는 컬럼만 남기므로 양쪽 모두 선언해도 안전
    desired_cols = [
        "일차", "날짜",
        "재배사_최저", "재배사_최고", "재배사_일평균",
        "품온_최저", "품온_최고", "품온_일평균",
        "Limit_Prod",
        "CO2_최저", "CO2_최고", "CO2_일평균",
        "Limit_CO2",
        "외부_최저기온", "외부_최고기온", "외부_평균기온",
        "살수횟수",
        "지하수_일평균",    # 수남리 고유 (GW 평균)
        "온수_일평균",      # 수남리 고유 (Hot 평균)
        "살수온도_최저",    # 안평리 고유 (단일 살수온도 최저)
        "살수온도_최고",    # 안평리 고유 (단일 살수온도 최고)
        "살수온도_일평균",  # 안평리 고유 (단일 살수온도 평균)
        "경고_재배사", "경고_품온", "경고_CO2",
        "품온초과(분)", "CO2초과(분)",          # 초과 시간 (분)
        "재배사_주간평균", "재배사_야간평균",    # 주간(06~18시) / 야간 평균
    ]
    final_day_cols = [c for c in desired_cols if c in daily_df.columns]
    daily_df = daily_df[final_day_cols]

    # 경고 로그 취합
    all_logs = []
    for d in sorted(daily_results.keys()):
        all_logs.extend(daily_results[d]["logs"])
    df_alert = (
        pd.DataFrame(all_logs)
        if all_logs
        else pd.DataFrame(columns=["날짜", "경고유형", "시작시각", "종료시각", "지속시간", "최대치"])
    )
    df_alert = df_alert.replace([np.inf, -np.inf], np.nan).fillna("")

    # 파일 쓰기 가능 확인
    try:
        with open(output_path, "a"):
            pass
    except PermissionError:
        raise PermissionError(f"파일이 열려 있습니다. 닫고 다시 시도하세요.\n[{output_path}]")

    logger.info(f"Excel 리포트 생성 시작: {os.path.basename(output_path)}")

    # --- Excel 생성 시작 (xlsxwriter: 스트리밍 방식, 낮은 메모리 사용) ---
    with pd.ExcelWriter(output_path, engine="xlsxwriter") as writer:
        wb = writer.book
        fmts = _create_formats(wb)

        # 파일 메타데이터 설정
        wb.set_properties({
            "title": "수남리 재배 데이터 리포트",
            "subject": "수남리 재배 데이터 리포트",
            "author": "농업회사법인 재우",
            "company": "농업회사법인 재우",
            "category": "내부전용",
            "comments": "본 문서는 농업회사법인 재우의 자산입니다.",
        })

        start_date_str = daily_df["날짜"].min() if not daily_df.empty else "-"
        end_date_str = daily_df["날짜"].max() if not daily_df.empty else "-"
        prod_str_title = prod_date.strftime("%Y년 %m월 %d일 생산")

        # 시트 0: 표지
        _write_cover_sheet(
            wb, fmts,
            prod_str_title=prod_str_title,
            start_date_str=start_date_str,
            end_date_str=end_date_str,
            room_id=room_id,
            factory_name=factory_name,
            line_id=line_id,
        )

        # 시트 1: 대시보드
        _write_dashboard(
            wb, writer, ws_name="대시보드",
            daily_df=daily_df, event_df=event_df, df_alert=df_alert,
            prod_str_title=prod_str_title,
            start_date_str=start_date_str, end_date_str=end_date_str,
            fmts=fmts, config=config,
        )

        # 시트 2: 일별 요약
        daily_df.to_excel(writer, sheet_name="일별_요약", index=False)
        ws_daily = writer.sheets["일별_요약"]
        ws_daily.set_column(0, len(daily_df.columns) - 1, 15)
        ws_daily.conditional_format(
            1, 0, len(daily_df), len(daily_df.columns) - 1,
            {"type": "text", "criteria": "containing", "value": "회", "format": fmts["warn"]},
        )

        # 시트 3: 살수 이벤트 상세
        event_df.to_excel(writer, sheet_name="살수_이벤트_상세분석(±1h)", index=False)
        ws_event = writer.sheets["살수_이벤트_상세분석(±1h)"]
        ws_event.set_column(0, len(event_df.columns) - 1, 15)
        ws_event.set_column("E:F", 15, fmts["time_only"])

        # 시트 4~N: 일차별 상세 (메모리 최적화: 시트 작성 후 해당일 데이터 해제)
        for day in sorted(daily_results.keys()):
            _write_day_sheet(
                wb, writer, day,
                daily_results=daily_results, daily_df=daily_df,
                event_df=event_df, events=events,
                fmts=fmts,
                config=config,
            )
            # 작성 완료된 일차 데이터 해제 (daily_results[day]['data']가 가장 큼)
            if day in daily_results:
                daily_results[day]["data"] = None
                daily_results[day]["raw_dt"] = None
                daily_results[day]["events_df"] = None
            gc.collect()
            logger.debug(f"  {day}일차 시트 완료, 메모리 해제")

        # 시트: 종합 리포트
        _write_summary_report(
            wb, writer,
            daily_df=daily_df, event_df=event_df, df_alert=df_alert,
            daily_results=daily_results, events=events, config=config,
            prod_str_title=prod_str_title,
            start_date_str=start_date_str, end_date_str=end_date_str,
            room_id=room_id, factory_name=factory_name, line_id=line_id,
            fmts=fmts,
        )

        # 모든 시트에 Header/Footer 적용, 보안 표기는 표지·종합만
        for ws in wb.worksheets():
            _apply_header_footer(ws)
            name = ws.get_name()
            if name in ("표지", "종합_리포트"):
                _apply_security_label(ws, wb)

    logger.info(f"Excel 리포트 생성 완료: {os.path.basename(output_path)}")
    return True


# ─── 포맷 정의 ───────────────────────────────────────────

def _create_formats(wb):
    """워크북 공용 포맷을 생성한다."""
    return {
        "head": wb.add_format({
            "bold": True, "font_color": "white", "bg_color": "#34495E",
            "border": 1, "align": "center", "valign": "vcenter",
        }),
        "table_header": wb.add_format({
            "bold": True, "font_color": "white", "bg_color": "#1F4E78",
            "border": 1, "align": "center", "valign": "vcenter",
        }),
        "warn": wb.add_format({"bg_color": "#FFCDD2", "font_color": "#C62828"}),
        "title": wb.add_format({
            "bold": True, "font_size": 20, "font_color": "#2C3E50",
            "align": "center", "valign": "vcenter",
        }),
        "sub_title": wb.add_format({
            "bold": True, "font_size": 14, "font_color": "#34495E", "underline": True,
        }),
        "alert_head": wb.add_format({
            "bold": True, "font_color": "white", "bg_color": "#E74C3C",
            "border": 1, "align": "center", "valign": "vcenter",
        }),
        "center": wb.add_format({"align": "center", "valign": "vcenter"}),
        "danger": wb.add_format({
            "bg_color": "#FFEBEE", "font_color": "#C62828",
            "bold": True, "align": "center",
        }),
        "caution": wb.add_format({
            "align": "center", "bg_color": "#FFF3E0",
            "font_color": "#E67E22", "bold": True,
        }),
        "normal": wb.add_format({"align": "center", "font_color": "#7F8C8D"}),
        "time_only": wb.add_format({"num_format": "hh:mm", "align": "center"}),
        "datetime_data": wb.add_format({"num_format": "hh:mm", "align": "center"}),
        "danger_cell": wb.add_format({
            "bg_color": "#FFCDD2", "font_color": "#C62828", "align": "center",
        }),
        "border": wb.add_format({
            "border": 1, "text_wrap": True, "valign": "top",
        }),
        "spraying": wb.add_format({
            "bg_color": "#BDD7EE", "font_color": "#000000",
            "align": "center", "bold": True,
        }),
        "co2_critical": wb.add_format({
            "bg_color": "#FCE4D6", "font_color": "#C00000",
            "align": "center", "bold": True,
        }),
        # 수남리 추가: GW / Hot 구분용
        "gw_bar": wb.add_format({"bg_color": "#AED6F1"}),
        "hot_bar": wb.add_format({"bg_color": "#FADBD8"}),
    }


def _chart_styles():
    """차트 시리즈 스타일을 반환한다 (기업형 통일 색상)."""
    return {
        "max": {
            "line": {"color": "#C00000", "width": 2.25},
            "marker": {"type": "circle", "size": 5,
                       "border": {"color": "#C00000"}, "fill": {"color": "white"}},
        },
        "avg": {
            "line": {"color": "#1F4E79", "width": 2.25},
            "marker": {"type": "none"},
        },
        "min": {
            "line": {"color": "#7F7F7F", "width": 2.25},
            "marker": {"type": "circle", "size": 5,
                       "border": {"color": "#7F7F7F"}, "fill": {"color": "white"}},
        },
        "limit": {
            "line": {"color": "#7030A0", "width": 2.0, "dash_type": "dash"},
            "marker": {"type": "none"},
        },
    }


def _apply_chart_style(chart):
    """모든 차트에 공통 기업형 스타일을 적용한다."""
    chart.set_style(10)
    chart.set_legend({"position": "bottom", "font": {"size": 9}})
    chart.set_x_axis({
        "label_position": "low",
        "num_font": {"size": 8},
        "line": {"color": "#BFBFBF"},
    })
    chart.set_y_axis({
        "major_gridlines": {"visible": True, "line": {"color": "#E6E6E6"}},
        "num_font": {"size": 8},
    })


# ─── 표지 시트 ─────────────────────────────────────────────

def _write_cover_sheet(wb, fmts, prod_str_title, start_date_str, end_date_str,
                       room_id, factory_name="수남리", line_id=None):
    """표지 시트를 작성한다. 기업형 고급 디자인.
    factory_name / line_id 로 공장·라인 정보를 동적으로 표시한다.
    """
    ws = wb.add_worksheet("표지")
    ws.activate()
    ws.hide_gridlines(2)
    ws.set_landscape()
    ws.set_paper(9)  # A4

    # 열 너비 설정
    ws.set_column("A:A", 4)
    ws.set_column("B:M", 10)

    # ── 상단 보안 바 (전체 배경) ─────────────────────────
    fmt_security_bar = wb.add_format({
        "bg_color": "#C00000", "font_color": "white",
        "bold": True, "font_size": 10,
        "align": "center", "valign": "vcenter",
    })
    ws.set_row(0, 22)
    ws.merge_range(
        "A1:M1",
        "⚠  이 문서는 재우의 재산이므로 무단 반출 및 배포시 처벌 대상입니다  ⚠",
        fmt_security_bar,
    )

    # ── 로고 삽입 (좌측) ────────────────────────────────
    logo_path = _get_logo_path()
    if logo_path:
        try:
            scale = 180 / 497
            ws.insert_image("A2", logo_path, {
                "x_scale": scale, "y_scale": scale,
                "x_offset": 10, "y_offset": 8, "object_position": 2,
            })
        except Exception as e:
            logger.warning(f"표지 로고 삽입 실패 (비치명적): {e}")

    # ── 회사명 ──────────────────────────────────────────
    fmt_company = wb.add_format({
        "font_size": 12, "font_color": "#7F7F7F",
        "align": "center", "valign": "vcenter",
    })
    ws.set_row(3, 24)
    ws.merge_range("B4:M4", "농업회사법인 재우", fmt_company)

    # ── 구분선 (얇은 상단 border 셀) ─────────────────────
    fmt_line = wb.add_format({"bottom": 2, "bottom_color": "#1F4E79"})
    ws.merge_range("B5:M5", "", fmt_line)

    # ── 메인 제목 ────────────────────────────────────────
    fmt_title_main = wb.add_format({
        "font_size": 26, "bold": True, "font_color": "#1F4E79",
        "align": "center", "valign": "vcenter", "text_wrap": True,
    })
    ws.set_row(6, 36)
    ws.set_row(7, 36)
    ws.set_row(8, 36)
    ws.merge_range(
        "B7:M9",
        f"숙주 재배 종합 리포트\n{prod_str_title}",
        fmt_title_main,
    )

    # ── 분석 기간 ─────────────────────────────────────────
    fmt_period = wb.add_format({
        "font_size": 13, "font_color": "#404040",
        "align": "center", "valign": "vcenter",
    })
    ws.set_row(10, 26)
    ws.merge_range("B11:M11",
                   f"분석 기간 : {start_date_str}  ~  {end_date_str}",
                   fmt_period)

    # ── 공장 / 재배사 / 라인 정보 ─────────────────────────
    if line_id is not None:
        location_text = f"{factory_name}  |  {line_id}라인  |  {room_id}재배사"
    else:
        location_text = f"{factory_name}  |  {room_id}재배사"

    fmt_location = wb.add_format({
        "font_size": 14, "bold": True, "font_color": "#2C3E50",
        "align": "center", "valign": "vcenter",
        "bg_color": "#EBF5FB", "border": 1,
    })
    ws.set_row(12, 30)
    ws.merge_range("C13:L13", location_text, fmt_location)

    # ── 빈 공간 ─────────────────────────────────────────
    for r in range(13, 22):
        ws.set_row(r, 18)

    # ── 주의 박스 (중간) ───────────────────────────────
    fmt_notice_title = wb.add_format({
        "bold": True, "font_size": 11, "font_color": "#C00000",
        "align": "center", "valign": "vcenter",
        "bg_color": "#FFEBEE", "border": 1, "border_color": "#C00000",
    })
    fmt_notice_body = wb.add_format({
        "font_size": 10, "font_color": "#333333",
        "align": "center", "valign": "vcenter", "text_wrap": True,
        "bg_color": "#FFEBEE", "border": 1, "border_color": "#C00000",
    })
    ws.set_row(22, 24)
    ws.set_row(23, 44)
    ws.merge_range("D23:K23", "【 보안 주의사항 】", fmt_notice_title)
    ws.merge_range(
        "D24:K24",
        "이 문서는 재우의 재산이므로 무단 반출 및 배포시 처벌 대상입니다.\n"
        "본 리포트는 농업회사법인 재우 내부 전용 자료이며, 외부 유출을 엄금합니다.",
        fmt_notice_body,
    )

    # ── 하단 내부전용 스탬프 ──────────────────────────────
    fmt_stamp = wb.add_format({
        "font_size": 9, "italic": True, "font_color": "#AAAAAA",
        "align": "center", "valign": "vcenter",
    })
    ws.set_row(29, 18)
    ws.merge_range("B30:M30",
                   "CONFIDENTIAL  |  농업회사법인 재우 내부전용  |  무단복제금지",
                   fmt_stamp)


# ─── Header / Footer ──────────────────────────────────────────

def _apply_header_footer(ws):
    """모든 시트에 표준 헤더와 푸터를 설정한다."""
    ws.set_header(
        '&C&"맑은 고딕,보통"&10 농업회사법인 재우 | 내부전용 | 무단유출금지'
    )
    ws.set_footer(
        '&R페이지 &P / &N'
    )


# ─── 보안 표기 ─────────────────────────────────────────────────

def _apply_security_label(ws, wb):
    """각 시트 우측 상단(L1)에 간결한 보안 표기를 삽입한다."""
    fmt = wb.add_format({
        "font_size": 9,
        "italic": True,
        "font_color": "#7F8C8D",
        "align": "right",
        "valign": "vcenter",
    })
    ws.write(0, 11, "농업회사법인 재우 | 내부전용", fmt)


# ─── 대시보드 ───────────────────────────────────────────

def _write_dashboard(wb, writer, ws_name, daily_df, event_df, df_alert,
                     prod_str_title, start_date_str, end_date_str, fmts, config=None):
    """대시보드 시트를 작성한다."""
    ws = wb.add_worksheet(ws_name)
    ws.hide_gridlines(2)

    ws.set_column("A:A", 5)
    ws.set_row(1, 28)
    ws.set_row(2, 28)
    fmt_dash_title = wb.add_format({
        "bold": True, "font_size": 18, "font_color": "#2C3E50",
        "align": "left", "valign": "vcenter", "text_wrap": True,
    })
    ws.merge_range(
        "B2:M3",
        f"{prod_str_title} 숙주 재배 모니터링 리포트\n({start_date_str} ~ {end_date_str})",
        fmt_dash_title,
    )

    cols = list(daily_df.columns)
    si = _SafeIdx(cols)
    styles = _chart_styles()
    last_row = len(daily_df)

    idx_date = si("날짜")
    dash_size = {"width": 600, "height": 350}

    # 1) 재배사 온도
    if si("재배사_일평균") != -1:
        c = wb.add_chart({"type": "line"})
        c.add_series({"name": "최고", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("재배사_최고"), last_row, si("재배사_최고")], **styles["max"]})
        c.add_series({"name": "평균", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("재배사_일평균"), last_row, si("재배사_일평균")], **styles["avg"]})
        c.add_series({"name": "최저", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("재배사_최저"), last_row, si("재배사_최저")], **styles["min"]})
        c.set_title({"name": "재배사 온도 (℃)", "name_font": {"size": 12, "bold": True}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("B4", c)

    # 2) 품온 (동적 기준선)
    limit_prod_val = config.THRESHOLDS.get("limit_prod", 27) if config else 27
    if si("품온_일평균") != -1:
        c = wb.add_chart({"type": "line"})
        c.add_series({"name": "최고", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("품온_최고"), last_row, si("품온_최고")], **styles["max"]})
        c.add_series({"name": "평균", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("품온_일평균"), last_row, si("품온_일평균")], **styles["avg"]})
        c.add_series({"name": "최저", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("품온_최저"), last_row, si("품온_최저")], **styles["min"]})
        if si("Limit_Prod") != -1:
            c.add_series({"name": f"기준({int(limit_prod_val)}℃)",
                          "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("Limit_Prod"), last_row, si("Limit_Prod")],
                          **styles["limit"]})
        c.set_title({"name": "품온 (℃)", "name_font": {"size": 12, "bold": True}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("L4", c)

    # 3) 외부 기온
    if si("외부_평균기온") != -1:
        c = wb.add_chart({"type": "line"})
        c.add_series({"name": "최고", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("외부_최고기온"), last_row, si("외부_최고기온")], **styles["max"]})
        c.add_series({"name": "평균", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("외부_평균기온"), last_row, si("외부_평균기온")], **styles["avg"]})
        c.add_series({"name": "최저", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("외부_최저기온"), last_row, si("외부_최저기온")], **styles["min"]})
        c.set_title({"name": "외부 기온", "name_font": {"size": 12, "bold": True}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("B22", c)

    # 4) CO2 ① 기준선(Limit_CO2) 추가
    limit_co2_val = config.THRESHOLDS.get("limit_co2", 6000) if config else 6000
    if si("CO2_일평균") != -1:
        c = wb.add_chart({"type": "line"})
        c.add_series({"name": "최고", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("CO2_최고"), last_row, si("CO2_최고")], **styles["max"]})
        c.add_series({"name": "평균", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("CO2_일평균"), last_row, si("CO2_일평균")], **styles["avg"]})
        c.add_series({"name": "최저", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("CO2_최저"), last_row, si("CO2_최저")], **styles["min"]})
        if si("Limit_CO2") != -1:
            c.add_series({"name": f"기준({int(limit_co2_val):,}ppm)",
                          "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("Limit_CO2"), last_row, si("Limit_CO2")],
                          **styles["limit"]})
        c.set_title({"name": "CO2 (ppm)", "name_font": {"size": 12, "bold": True}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("L22", c)

    # 5) 살수 온도 차트
    #    - 안평리: 단일 온도 최저/평균/최고 라인 차트
    #    - 수남리: 지하수(GW) vs 온수(Hot) 그룹형 바차트
    lbl = {"value": True, "num_format": "0.0", "font": {"size": 9}}
    has_water_single = si("살수온도_일평균") != -1   # 안평리
    has_gw = si("지하수_일평균") != -1               # 수남리
    has_hot = si("온수_일평균") != -1                # 수남리

    if has_water_single:
        # 안평리: 살수온도 최저/평균/최고 막대(column) 차트
        lbl_water = {"value": True, "num_format": "0.0", "font": {"size": 9}}
        c = wb.add_chart({"type": "column"})
        if si("살수온도_최저") != -1:
            c.add_series({
                "name": "최저",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("살수온도_최저"), last_row, si("살수온도_최저")],
                "fill": {"color": "#5DADE2"},
                "data_labels": lbl_water,
            })
        c.add_series({
            "name": "평균",
            "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
            "values": ["일별_요약", 1, si("살수온도_일평균"), last_row, si("살수온도_일평균")],
            "fill": {"color": "#1F4E79"},
            "data_labels": lbl_water,
        })
        if si("살수온도_최고") != -1:
            c.add_series({
                "name": "최고",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("살수온도_최고"), last_row, si("살수온도_최고")],
                "fill": {"color": "#C0392B"},
                "data_labels": lbl_water,
            })
        c.set_title({"name": "일별 살수온도 (℃)", "name_font": {"size": 12, "bold": True}})
        c.set_y_axis({"name": "온도(℃)", "major_gridlines": {"visible": True, "line": {"color": "#E6E6E6"}}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("L40", c)
    elif has_gw or has_hot:
        # 수남리: 지하수(GW) vs 온수(Hot) 그룹형 바차트
        c = wb.add_chart({"type": "column"})
        if has_gw:
            c.add_series({
                "name": "지하수(GW) 평균",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("지하수_일평균"), last_row, si("지하수_일평균")],
                "fill": {"color": "#AED6F1"},
                "data_labels": lbl,
            })
        if has_hot:
            c.add_series({
                "name": "온수(Hot) 평균",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("온수_일평균"), last_row, si("온수_일평균")],
                "fill": {"color": "#F1948A"},
                "data_labels": lbl,
            })
        c.set_title({"name": "일별 살수온도 비교 (지하수 vs 온수)", "name_font": {"size": 12, "bold": True}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("L40", c)

    # 6) 냉각 효과
    if not event_df.empty and "이벤트ID" in event_df.columns and "냉각효과(℃)" in event_df.columns:
        i_ev = event_df.columns.get_loc("이벤트ID")
        i_cool = event_df.columns.get_loc("냉각효과(℃)")
        l_ev = len(event_df)
        c = wb.add_chart({"type": "column"})
        c.add_series({
            "name": "냉각효과(℃)",
            "categories": ["살수_이벤트_상세분석(±1h)", 1, i_ev, l_ev, i_ev],
            "values": ["살수_이벤트_상세분석(±1h)", 1, i_cool, l_ev, i_cool],
            "fill": {"color": "#1F4E79"},
            "data_labels": {"value": True, "num_format": "0.0", "font": {"size": 9}},
        })
        c.set_title({"name": "회차별 냉각 효과", "name_font": {"size": 12, "bold": True}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("B40", c)

    # ④ 재배사온도 + 외부기온 복합 차트 (B58)
    has_room = si("재배사_일평균") != -1
    has_ext = si("외부_평균기온") != -1
    if has_room or has_ext:
        c = wb.add_chart({"type": "line"})
        if has_room:
            c.add_series({
                "name": "재배사 평균",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("재배사_일평균"), last_row, si("재배사_일평균")],
                "line": {"color": "#2980B9", "width": 2.5},
                "marker": {"type": "circle", "size": 5,
                            "border": {"color": "#2980B9"}, "fill": {"color": "white"}},
            })
            if si("재배사_최고") != -1:
                c.add_series({
                    "name": "재배사 최고",
                    "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                    "values": ["일별_요약", 1, si("재배사_최고"), last_row, si("재배사_최고")],
                    "line": {"color": "#5DADE2", "width": 1.5, "dash_type": "dash"},
                    "marker": {"type": "none"},
                })
        if has_ext:
            c.add_series({
                "name": "외부기온 평균",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("외부_평균기온"), last_row, si("외부_평균기온")],
                "line": {"color": "#E67E22", "width": 2.5},
                "marker": {"type": "square", "size": 5,
                            "border": {"color": "#E67E22"}, "fill": {"color": "white"}},
            })
        c.set_title({"name": "재배사 온도 vs 외부기온 비교 (℃)", "name_font": {"size": 12, "bold": True}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("B58", c)

    # ⑤ 일별 경고 막대 차트 (L58)
    warn_cols_avail = [c_ for c_ in ["경고_재배사", "경고_품온", "경고_CO2"] if si(c_) != -1]
    if warn_cols_avail:
        c = wb.add_chart({"type": "column", "subtype": "stacked"})
        warn_colors = {"경고_재배사": "#3498DB", "경고_품온": "#E74C3C", "경고_CO2": "#F39C12"}
        warn_labels_map = {"경고_재배사": "재배사(변동폭)", "경고_품온": "품온 초과", "경고_CO2": "CO2 초과"}
        for wc in warn_cols_avail:
            c.add_series({
                "name": warn_labels_map.get(wc, wc),
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si(wc), last_row, si(wc)],
                "fill": {"color": warn_colors.get(wc, "#95A5A6")},
                "data_labels": {"value": True, "num_format": "0", "font": {"size": 9}},
            })
        c.set_title({"name": "일별 경고 발생 현황", "name_font": {"size": 12, "bold": True}})
        c.set_y_axis({"name": "경고 횟수", "major_gridlines": {"visible": True, "line": {"color": "#E6E6E6"}}})
        c.set_size(dash_size)
        _apply_chart_style(c)
        ws.insert_chart("L58", c)

    # --- 경고 테이블 (row 76으로 이동 - 새 차트 추가 후) ---
    _write_warn_table(ws, daily_df, fmts, config=config, start_row=76)

    # --- 이상 감지 로그 ---
    if not df_alert.empty:
        _write_alert_log(ws, df_alert, fmts, start_row=76)


def _write_warn_table(ws, daily_df, fmts, config=None, start_row=76):
    """대시보드에 일별 경고 횟수 요약 테이블을 작성한다.
    start_row: 테이블 헤더가 위치할 행 번호 (0-indexed, 기본 76).
    """
    warn_cols = ["날짜", "경고_재배사", "경고_품온", "품온초과(분)", "경고_CO2", "CO2초과(분)"]
    available = [c for c in warn_cols if c in daily_df.columns]
    if not available:
        return
    warn_data = daily_df[available].copy()

    # 동적 임계값 표시
    limit_prod = config.THRESHOLDS.get("limit_prod", 27) if config else 27
    limit_co2 = config.THRESHOLDS.get("limit_co2", 6000) if config else 6000

    n_cols = len(available) - 1  # 날짜 제외
    table_row, table_col = start_row, 1
    ws.set_column(table_col, table_col, 25)
    ws.set_column(table_col + 1, table_col + n_cols, 18)
    ws.set_row(table_row - 1, 40)
    ws.set_row(table_row, 30)

    ws.merge_range(
        table_row - 1, table_col, table_row - 1, table_col + n_cols,
        "\U0001f6a8 일별 경고 발생 횟수 요약", fmts["title"],
    )

    header_map = {
        "날짜": "날짜",
        "경고_재배사": "재배사(변동폭)",
        "경고_품온":   f"품온(>{int(limit_prod)}℃) 횟수",
        "품온초과(분)": f"품온초과 시간(분)",
        "경고_CO2":   f"CO2(>{int(limit_co2):,}ppm) 횟수",
        "CO2초과(분)": "CO2초과 시간(분)",
    }
    for i, col in enumerate(available):
        ws.write(table_row, table_col + i, header_map.get(col, col), fmts["head"])

    for r_idx, row_data in warn_data.iterrows():
        ws.write(table_row + 1 + r_idx, table_col, row_data["날짜"], fmts["center"])
        for c_idx, col in enumerate(available[1:]):
            val = row_data.get(col, 0)
            cell_val = int(val) if pd.notnull(val) and val != "" else 0
            # 초과 시간(분) 컬럼은 분 단위 표시
            if "초과(분)" in col:
                if cell_val == 0:
                    f = fmts["normal"]
                elif cell_val <= 30:
                    f = fmts["caution"]
                else:
                    f = fmts["danger"]
                ws.write(table_row + 1 + r_idx, table_col + 1 + c_idx, f"{cell_val}분", f)
            else:
                if cell_val == 0:
                    f = fmts["normal"]
                elif cell_val <= 5:
                    f = fmts["caution"]
                else:
                    f = fmts["danger"]
                ws.write(table_row + 1 + r_idx, table_col + 1 + c_idx, f"{cell_val}회", f)


def _write_alert_log(ws, df_alert, fmts, start_row=76):
    """대시보드에 이상 감지 상세 로그를 작성한다."""
    start_col = 11
    ws.set_column(start_col, start_col, 22)
    ws.set_column(start_col + 1, start_col + 1, 16)
    ws.set_column(start_col + 2, start_col + 5, 13)

    ws.merge_range(
        start_row - 1, start_col, start_row - 1, start_col + 5,
        "\U0001f50e 이상 감지 상세 로그 (구간 분석)", fmts["title"],
    )

    for i, col_name in enumerate(df_alert.columns):
        ws.write(start_row, start_col + i, col_name, fmts["alert_head"])
    for row_idx, row_data in df_alert.iterrows():
        for col_idx, value in enumerate(row_data):
            ws.write(start_row + 1 + row_idx, start_col + col_idx, value, fmts["center"])


# ─── 일차별 상세 시트 ──────────────────────────────────────

def _write_day_sheet(wb, writer, day, daily_results, daily_df, event_df,
                     events, fmts, config):
    """개별 일차 상세 시트를 작성한다."""
    sheet_name = f"{day}일차"
    day_data = daily_results[day]
    chart_df = day_data["data"]
    day_logs = day_data["logs"]
    raw_dt = day_data["raw_dt"]
    day_events_df = day_data["events_df"]
    styles = _chart_styles()

    # 원본 시간만 추출한 뷰
    view_df = chart_df[chart_df["dt"].isin(raw_dt)].copy()
    view_df["상태"] = ""
    current_day_events = [e for e in events if e["day_index"] == day]
    for ev in current_day_events:
        mask = (view_df["dt"] >= ev["start_time"]) & (view_df["dt"] <= ev["end_time"])
        view_df.loc[mask, "상태"] = "살수중"

    # 차트용 데이터 (숨김 컬럼)
    base_cols = [
        "dt", "Time_Fraction", "재배사온도(℃)", "품온(℃)", "살수온도(℃)",
        "CO2농도(ppm)", "외부기온(℃)", "Ref_Prod", "Ref_CO2",
    ]
    marker_cols = [c for c in chart_df.columns if "Mark_" in c]
    chart_export_cols = [c for c in base_cols if c in chart_df.columns] + marker_cols
    chart_export = chart_df[chart_export_cols]

    # 사용자 보기용 데이터
    view_base = [c for c in base_cols if c not in ["Time_Fraction", "Ref_Prod", "Ref_CO2"]]
    view_df = view_df.rename(columns={"dt": "일시"})
    view_base = ["일시" if c == "dt" else c for c in view_base]
    view_export_cols = [c for c in view_base if c in view_df.columns] + ["상태"]
    view_export = view_df[view_export_cols]

    # 누락 데이터 행 제거
    check_cols = [c for c in ["재배사온도(℃)", "품온(℃)", "살수온도(℃)", "CO2농도(ppm)"] if c in view_export.columns]
    if check_cols:
        view_export = view_export.dropna(subset=check_cols, how="all")

    chart_col_idx = 51
    view_col_idx = 11

    # 데이터 쓰기
    chart_export.to_excel(writer, sheet_name=sheet_name, index=False, startcol=chart_col_idx)
    view_export.to_excel(writer, sheet_name=sheet_name, index=False, header=False,
                         startcol=view_col_idx, startrow=1)

    ws = writer.sheets[sheet_name]

    # 헤더
    for col_num, value in enumerate(view_export.columns):
        ws.write(0, view_col_idx + col_num, value, fmts["table_header"])

    ws.freeze_panes(1, 0)
    ws.hide_gridlines(2)
    ws.set_column("A:A", 5)
    ws.set_row(0, 36)

    # 냉각효과 데이터
    cool_col_idx = chart_col_idx + len(chart_export_cols) + 2
    if not day_events_df.empty and "event_id" in day_events_df.columns:
        day_events_df[["event_id", "Cooling_Delta"]].to_excel(
            writer, sheet_name=sheet_name, index=False, startcol=cool_col_idx,
        )

    # 열 너비 / 포맷
    ws.set_column(view_col_idx, view_col_idx, 20, fmts["datetime_data"])
    ws.set_column(view_col_idx + 1, view_col_idx + 5, 12, fmts["center"])
    ws.set_column(view_col_idx + 6, view_col_idx + 6, 12, fmts["center"])
    ws.set_column(chart_col_idx, chart_col_idx + len(chart_export_cols) + 5, None, None, {"hidden": True})

    # 조건부 서식 (수남리: prod >= 27, CO2 >= 6000)
    data_len = len(view_export)
    col_prod_view = view_col_idx + 2
    col_co2_view = view_col_idx + 4
    col_status_view = view_col_idx + 6

    limit_prod = config.THRESHOLDS.get("limit_prod", 27)
    limit_co2 = config.THRESHOLDS.get("limit_co2", 6000)

    ws.conditional_format(1, col_prod_view, data_len, col_prod_view,
                          {"type": "cell", "criteria": ">=", "value": limit_prod, "format": fmts["danger_cell"]})
    ws.conditional_format(1, col_co2_view, data_len, col_co2_view,
                          {"type": "cell", "criteria": ">=", "value": limit_co2, "format": fmts["danger_cell"]})
    # CO2 극단값 강조
    ws.conditional_format(1, col_co2_view, data_len, col_co2_view,
                          {"type": "cell", "criteria": ">=", "value": 8000, "format": fmts["co2_critical"]})
    ws.conditional_format(1, col_status_view, data_len, col_status_view,
                          {"type": "cell", "criteria": "equal to", "value": '"살수중"', "format": fmts["spraying"]})

    # 시트 제목
    target_date_str = chart_df["dt"].dt.date.iloc[0].strftime("%Y-%m-%d")
    fmt_day_title = wb.add_format({
        "bold": True, "font_size": 20, "font_color": "#2C3E50",
        "align": "left", "valign": "vcenter",
    })
    ws.merge_range("B1:G1",
                   f"\U0001f4c5 재배 {day}일차 상세 리포트 ({target_date_str})",
                   fmt_day_title)

    # 일일 핵심 요약
    current_write_row = 3
    day_sum = daily_df[daily_df["일차"] == day]
    if not day_sum.empty:
        ws.write_string(current_write_row, 1, "\U0001f4ca 일일 핵심 요약", fmts["title"])
        headers = ["재배사 최고", "재배사 최저", "품온 최고", "품온 경고", "CO2 경고", "살수 횟수"]
        values = [
            day_sum["재배사_최고"].values[0], day_sum["재배사_최저"].values[0],
            day_sum["품온_최고"].values[0], day_sum["경고_품온"].values[0],
            day_sum["경고_CO2"].values[0], day_sum["살수횟수"].values[0],
        ]
        current_write_row += 1
        for i, h in enumerate(headers):
            ws.write(current_write_row, 1 + i, h, fmts["head"])
            val = values[i]
            cell_fmt = fmts["center"]
            if "경고" in h and isinstance(val, (int, float)) and val > 0:
                cell_fmt = fmts["danger"]
            ws.write(current_write_row + 1, 1 + i, val, cell_fmt)
        ws.set_column(1, 7, 15)
        current_write_row += 4

    # 이상 감지 로그
    if day_logs:
        ws.write_string(current_write_row, 1, "\U0001f50e 이상 감지 로그", fmts["title"])
        current_write_row += 1
        log_headers = list(day_logs[0].keys())
        for c_idx, col_name in enumerate(log_headers):
            ws.write(current_write_row, 1 + c_idx, col_name, fmts["alert_head"])
        for r_idx, log_data in enumerate(day_logs):
            for c_idx, (_, v) in enumerate(log_data.items()):
                ws.write(current_write_row + 1 + r_idx, 1 + c_idx, v, fmts["center"])
        current_write_row += len(day_logs) + 3

    # --- 일차 상세 전용 차트 ---
    last_data_row = len(chart_export)

    # 차트 컬럼 인덱스 (base_cols 순서 기반)
    _base = [c for c in base_cols if c in chart_export_cols]
    def _cidx(name):
        try:
            return chart_col_idx + _base.index(name)
        except ValueError:
            return -1

    idx_tf = _cidx("Time_Fraction")
    idx_room = _cidx("재배사온도(℃)")
    idx_prod = _cidx("품온(℃)")
    idx_water = _cidx("살수온도(℃)")
    idx_co2 = _cidx("CO2농도(ppm)")
    idx_ext = _cidx("외부기온(℃)")
    idx_ref_prod = _cidx("Ref_Prod")
    # marker cols: Mark_Start_Room, Mark_End_Room, Mark_Start_Prod, Mark_End_Prod,
    #              Mark_Start_Ext, Mark_End_Ext, Mark_Start_CO2, Mark_End_CO2,
    #              Mark_Start_Water, Mark_End_Water (in order)
    base_mark = chart_col_idx + len(_base)

    common_axis = {
        "name": "시간", "min": 0, "max": 1, "major_unit": 1 / 6,
        "num_format": "hh:mm",
        "major_gridlines": {"visible": True, "line": {"color": "#F0F0F0"}},
        "interval_unit": 120,
    }
    chart_size = {"width": 720, "height": 320}
    chart_plot = {"layout": {"x": 0.12, "y": 0.12, "width": 0.72, "height": 0.72}}

    sn = sheet_name
    mk_start = {"type": "circle", "size": 4, "fill": {"color": "blue"}}
    mk_end = {"type": "circle", "size": 4, "fill": {"color": "red"}}

    # 1. 재배사 온도
    if idx_tf != -1 and idx_room != -1:
        ch = wb.add_chart({"type": "scatter", "subtype": "straight"})
        ch.show_hidden_data()
        ch.add_series({"name": "재배사 온도", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                       "values": [sn, 1, idx_room, last_data_row, idx_room], "line": {"color": "#2980B9", "width": 1.5}})
        if base_mark < chart_col_idx + len(chart_export_cols):
            ch.add_series({"name": "살수 시작", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, base_mark, last_data_row, base_mark],
                           "line": {"none": True}, "marker": mk_start})
            ch.add_series({"name": "살수 종료", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, base_mark + 1, last_data_row, base_mark + 1],
                           "line": {"none": True}, "marker": mk_end})
        ch.set_title({"name": "1. 재배사 온도 변화", "name_font": {"size": 12, "bold": True}})
        ch.set_x_axis(common_axis)
        ch.set_y_axis({"name": "온도(℃)", "major_gridlines": {"visible": True}})
        ch.set_legend({"position": "right"})
        ch.set_size(chart_size)
        ch.set_plotarea(chart_plot)
        ws.insert_chart("B10", ch)

    # 2. 품온 (수남리: 기준 27℃)
    if idx_tf != -1 and idx_prod != -1:
        ch = wb.add_chart({"type": "scatter", "subtype": "straight"})
        ch.show_hidden_data()
        ch.add_series({"name": "품온", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                       "values": [sn, 1, idx_prod, last_data_row, idx_prod], "line": {"color": "#E67E22", "width": 1.5}})
        if idx_ref_prod != -1:
            ch.add_series({"name": f"기준({int(limit_prod)}℃)", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, idx_ref_prod, last_data_row, idx_ref_prod], **styles["limit"]})
        if base_mark + 2 < chart_col_idx + len(chart_export_cols):
            ch.add_series({"name": "살수 시작", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, base_mark + 2, last_data_row, base_mark + 2],
                           "line": {"none": True}, "marker": mk_start})
            ch.add_series({"name": "살수 종료", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, base_mark + 3, last_data_row, base_mark + 3],
                           "line": {"none": True}, "marker": mk_end})
        ch.set_title({"name": "2. 품온 변화", "name_font": {"size": 12, "bold": True}})
        ch.set_x_axis(common_axis)
        ch.set_y_axis({"name": "온도(℃)", "major_gridlines": {"visible": True}})
        ch.set_legend({"position": "right"})
        ch.set_size(chart_size)
        ch.set_plotarea(chart_plot)
        ws.insert_chart("B27", ch)

    # 3. 외부 기온
    if idx_tf != -1 and idx_ext != -1:
        ch = wb.add_chart({"type": "scatter", "subtype": "straight"})
        ch.show_hidden_data()
        ch.add_series({"name": "외부 기온", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                       "values": [sn, 1, idx_ext, last_data_row, idx_ext], "line": {"color": "#7F8C8D", "width": 1.5}})
        ch.set_title({"name": "3. 외부 기온 변화", "name_font": {"size": 12, "bold": True}})
        ch.set_x_axis({**common_axis, "label_position": "low"})
        ch.set_y_axis({"name": "온도(℃)", "major_gridlines": {"visible": True}})
        ch.set_legend({"position": "right"})
        ch.set_size(chart_size)
        ch.set_plotarea(chart_plot)
        ws.insert_chart("B44", ch)

    # 4. CO2
    if idx_tf != -1 and idx_co2 != -1:
        ch = wb.add_chart({"type": "scatter", "subtype": "straight"})
        ch.show_hidden_data()
        ch.add_series({"name": "CO2 농도", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                       "values": [sn, 1, idx_co2, last_data_row, idx_co2], "line": {"color": "#27AE60", "width": 1.5}})
        if base_mark + 6 < chart_col_idx + len(chart_export_cols):
            ch.add_series({"name": "살수 시작", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, base_mark + 6, last_data_row, base_mark + 6],
                           "line": {"none": True}, "marker": mk_start})
            ch.add_series({"name": "살수 종료", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, base_mark + 7, last_data_row, base_mark + 7],
                           "line": {"none": True}, "marker": mk_end})
        ch.set_title({"name": "4. CO2 농도 변화", "name_font": {"size": 12, "bold": True}})
        ch.set_x_axis(common_axis)
        ch.set_y_axis({"name": "농도(ppm)", "major_gridlines": {"visible": True}})
        ch.set_legend({"position": "right"})
        ch.set_size(chart_size)
        ch.set_plotarea(chart_plot)
        ws.insert_chart("B61", ch)

    # 5. 살수 온도 (지하수/온수 원시 시계열 - 단일 수온 센서인 경우)
    if idx_tf != -1 and idx_water != -1:
        ch = wb.add_chart({"type": "scatter", "subtype": "straight"})
        ch.show_hidden_data()
        ch.add_series({"name": "살수온도(원수)", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                       "values": [sn, 1, idx_water, last_data_row, idx_water],
                       "line": {"color": "#AED6F1", "width": 1.5}})
        if base_mark + 8 < chart_col_idx + len(chart_export_cols):
            ch.add_series({"name": "살수 시작", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, base_mark + 8, last_data_row, base_mark + 8],
                           "line": {"none": True}, "marker": mk_start})
            ch.add_series({"name": "살수 종료", "categories": [sn, 1, idx_tf, last_data_row, idx_tf],
                           "values": [sn, 1, base_mark + 9, last_data_row, base_mark + 9],
                           "line": {"none": True}, "marker": mk_end})
        ch.set_title({"name": "5. 살수 온도 변화", "name_font": {"size": 12, "bold": True}})
        ch.set_x_axis(common_axis)
        ch.set_y_axis({"name": "온도(℃)", "major_gridlines": {"visible": True}})
        ch.set_legend({"position": "right"})
        ch.set_size(chart_size)
        ch.set_plotarea(chart_plot)
        ws.insert_chart("B78", ch)


# ─── 종합 리포트 ───────────────────────────────────────────

def _write_summary_report(wb, writer, daily_df, event_df, df_alert,
                          daily_results, events, config,
                          prod_str_title, start_date_str, end_date_str,
                          room_id, fmts, factory_name="수남리", line_id=None):
    """종합 리포트 시트를 작성한다."""
    styles = _chart_styles()
    ws = wb.add_worksheet("종합_리포트")
    ws.hide_gridlines(2)
    ws.set_paper(9)
    ws.set_landscape()
    ws.fit_to_pages(1, 0)
    ws.set_row(1, 60)

    fmt_summary_title = wb.add_format({
        "bold": True, "font_size": 16, "font_color": "#1F4E79",
        "align": "left", "valign": "vcenter",
    })
    ws.merge_range("B2:L2", f"{prod_str_title} 숙주 재배 종합 리포트", fmt_summary_title)

    location_part = f"{factory_name}"
    if line_id is not None:
        location_part += f" {line_id}라인"
    location_part += f" {room_id}재배사"
    info_text = (
        f"• 재배사: {location_part}   "
        f"• 분석 기간: {start_date_str} ~ {end_date_str}   "
        f"• 데이터: 5분 원본 (1분 보정 처리)"
    )
    fmt_info = wb.add_format({"align": "left", "valign": "vcenter", "font_size": 10, "font_color": "#404040"})
    ws.merge_range("B3:L3", info_text, fmt_info)
    ws.set_column(1, 1, 18)
    ws.set_column(2, 12, 12)

    # KPI 카드형 요약
    fmt_kpi_title = wb.add_format({
        "font_size": 10, "bold": True, "align": "center", "valign": "vcenter",
        "bg_color": "#E9EFF7", "border": 1,
    })
    fmt_kpi_value = wb.add_format({
        "font_size": 16, "bold": True, "align": "center", "valign": "vcenter",
        "font_color": "#1F4E79", "border": 1,
    })

    # KPI 값 계산
    avg_temp = pd.to_numeric(daily_df.get("재배사_일평균", pd.Series(dtype=float)), errors="coerce").mean()
    avg_prod = pd.to_numeric(daily_df.get("품온_일평균", pd.Series(dtype=float)), errors="coerce").mean()
    avg_co2 = pd.to_numeric(daily_df.get("CO2_일평균", pd.Series(dtype=float)), errors="coerce").mean()
    total_prod_exceed = int(pd.to_numeric(daily_df.get("품온초과(분)", pd.Series(dtype=float)), errors="coerce").sum())
    total_co2_exceed  = int(pd.to_numeric(daily_df.get("CO2초과(분)",  pd.Series(dtype=float)), errors="coerce").sum())

    # KPI 값에 따른 강조 포맷
    fmt_kpi_warn = wb.add_format({
        "font_size": 16, "bold": True, "align": "center", "valign": "vcenter",
        "font_color": "#C0392B", "border": 1,
    })

    ws.merge_range("B5:D5", "재배사 평균 온도", fmt_kpi_title)
    ws.merge_range("B6:D7", f"{avg_temp:.1f}℃" if pd.notna(avg_temp) else "-", fmt_kpi_value)

    ws.merge_range("F5:H5", "품온 평균", fmt_kpi_title)
    ws.merge_range("F6:H7", f"{avg_prod:.1f}℃" if pd.notna(avg_prod) else "-", fmt_kpi_value)

    ws.merge_range("J5:L5", "CO2 평균", fmt_kpi_title)
    ws.merge_range("J6:L7", f"{avg_co2:.0f}ppm" if pd.notna(avg_co2) else "-", fmt_kpi_value)

    # KPI 2행: 품온 / CO2 초과 시간
    fmt_kpi_title2 = wb.add_format({
        "font_size": 10, "bold": True, "align": "center", "valign": "vcenter",
        "bg_color": "#FDEBD0", "border": 1,
    })
    ws.merge_range("B8:D8", f"품온 초과 누적 시간", fmt_kpi_title2)
    prod_exceed_str = f"{total_prod_exceed // 60}h {total_prod_exceed % 60}m" if total_prod_exceed else "없음"
    ws.merge_range("B9:D9", prod_exceed_str, fmt_kpi_warn if total_prod_exceed else fmt_kpi_value)

    ws.merge_range("F8:H8", "CO2 초과 누적 시간", fmt_kpi_title2)
    co2_exceed_str = f"{total_co2_exceed // 60}h {total_co2_exceed % 60}m" if total_co2_exceed else "없음"
    ws.merge_range("F9:H9", co2_exceed_str, fmt_kpi_warn if total_co2_exceed else fmt_kpi_value)

    # KPI 3번째(주간/야간 구분)
    avg_day   = pd.to_numeric(daily_df.get("재배사_주간평균", pd.Series(dtype=float)), errors="coerce").mean()
    avg_night = pd.to_numeric(daily_df.get("재배사_야간평균", pd.Series(dtype=float)), errors="coerce").mean()
    fmt_kpi_title3 = wb.add_format({
        "font_size": 10, "bold": True, "align": "center", "valign": "vcenter",
        "bg_color": "#EBF5FB", "border": 1,
    })
    ws.merge_range("J8:L8", "주간 / 야간 재배사 평균", fmt_kpi_title3)
    day_night_str = (
        f"주간 {avg_day:.1f}℃  /  야간 {avg_night:.1f}℃"
        if pd.notna(avg_day) and pd.notna(avg_night)
        else "-"
    )
    fmt_kpi_small = wb.add_format({
        "font_size": 12, "bold": True, "align": "center", "valign": "vcenter",
        "font_color": "#1F4E79", "border": 1,
    })
    ws.merge_range("J9:L9", day_night_str, fmt_kpi_small)

    # 1. 일별 핵심 요약
    current_row = 9
    ws.write(current_row, 1, "1. 일별 핵심 요약", fmts["sub_title"])
    current_row += 1
    summary_cols = [
        "일차", "날짜",
        "재배사_주간평균", "재배사_야간평균", "재배사_일평균",
        "품온_일평균", "CO2_일평균",
        "살수횟수", "경고_품온", "품온초과(분)", "경고_CO2", "CO2초과(분)",
    ]
    summary_cols = [c for c in summary_cols if c in daily_df.columns]
    for i, col_name in enumerate(summary_cols):
        ws.write(current_row, 1 + i, col_name, fmts["head"])
    current_row += 1
    for r_idx, row_data in daily_df.iterrows():
        for c_idx, col_name in enumerate(summary_cols):
            val = row_data[col_name]
            cell_fmt = fmts["center"]
            if "경고" in col_name and isinstance(val, (int, float)) and val > 0:
                cell_fmt = fmts["danger"]
            elif "초과(분)" in col_name and isinstance(val, (int, float)) and val > 0:
                cell_fmt = fmts["caution"] if val <= 30 else fmts["danger"]
            ws.write(current_row + r_idx, 1 + c_idx, val, cell_fmt)

    current_row += len(daily_df) + 2

    # 2. 추이 차트
    ws.write(current_row, 1, "2. 기간별 주요 지표 변화 추이", fmts["sub_title"])

    cols = list(daily_df.columns)
    si = _SafeIdx(cols)
    last_row = len(daily_df)
    idx_date = si("날짜")

    summary_chart_size = {"width": 520, "height": 360}
    summary_chart_plot = {"layout": {"x": 0.15, "y": 0.15, "width": 0.75, "height": 0.7}}

    def _apply_summary_style(ch):
        ch.set_style(10)
        ch.set_legend({"position": "top", "font": {"size": 9}})
        ch.set_x_axis({
            "label_position": "low",
            "num_font": {"size": 8, "rotation": -30},
            "line": {"color": "#BFBFBF"},
        })
        ch.set_y_axis({
            "major_gridlines": {"visible": True, "line": {"color": "#E6E6E6"}},
            "num_font": {"size": 8},
        })

    # 동적 임계값
    limit_prod_val = config.THRESHOLDS.get("limit_prod", 27) if config else 27
    limit_co2_val = config.THRESHOLDS.get("limit_co2", 6000) if config else 6000

    # ② 재배사 온도 - min/max 추가
    if si("재배사_일평균") != -1:
        c = wb.add_chart({"type": "line"})
        if si("재배사_최고") != -1:
            c.add_series({"name": "최고", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("재배사_최고"), last_row, si("재배사_최고")],
                          **styles["max"]})
        c.add_series({"name": "평균", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("재배사_일평균"), last_row, si("재배사_일평균")],
                      **styles["avg"]})
        if si("재배사_최저") != -1:
            c.add_series({"name": "최저", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("재배사_최저"), last_row, si("재배사_최저")],
                          **styles["min"]})
        c.set_title({"name": "재배사 온도 (℃)", "overlay": False})
        c.set_size(summary_chart_size)
        c.set_plotarea(summary_chart_plot)
        _apply_summary_style(c)
        ws.insert_chart("B20", c)

    # ③ 품온 - min/max 추가 + 동적 기준선 레이블
    if si("품온_일평균") != -1:
        c = wb.add_chart({"type": "line"})
        if si("품온_최고") != -1:
            c.add_series({"name": "최고", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("품온_최고"), last_row, si("품온_최고")],
                          **styles["max"]})
        c.add_series({"name": "평균", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("품온_일평균"), last_row, si("품온_일평균")],
                      **styles["avg"]})
        if si("품온_최저") != -1:
            c.add_series({"name": "최저", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("품온_최저"), last_row, si("품온_최저")],
                          **styles["min"]})
        if si("Limit_Prod") != -1:
            c.add_series({"name": f"기준({int(limit_prod_val)}℃)",
                          "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("Limit_Prod"), last_row, si("Limit_Prod")],
                          **styles["limit"]})
        c.set_title({"name": "품온 추이 (℃)", "overlay": False})
        c.set_size(summary_chart_size)
        c.set_plotarea(summary_chart_plot)
        _apply_summary_style(c)
        ws.insert_chart("H20", c)

    if si("CO2_일평균") != -1:
        c = wb.add_chart({"type": "line"})
        c.add_series({"name": "최고", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("CO2_최고"), last_row, si("CO2_최고")], **styles["max"]})
        c.add_series({"name": "평균", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("CO2_일평균"), last_row, si("CO2_일평균")], **styles["avg"]})
        c.add_series({"name": "최저", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("CO2_최저"), last_row, si("CO2_최저")], **styles["min"]})
        if si("Limit_CO2") != -1:
            c.add_series({"name": f"기준({int(limit_co2_val):,}ppm)",
                          "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("Limit_CO2"), last_row, si("Limit_CO2")],
                          **styles["limit"]})
        c.set_title({"name": "CO2 농도 (ppm)", "overlay": False})
        c.set_size(summary_chart_size)
        c.set_plotarea(summary_chart_plot)
        _apply_summary_style(c)
        ws.insert_chart("B34", c)

    # 종합 리포트 살수온도 차트
    #   - 안평리: 단일 온도 최저/평균/최고 라인 차트
    #   - 수남리: 지하수 vs 온수 비교 바차트
    has_water_single = si("살수온도_일평균") != -1
    has_gw = si("지하수_일평균") != -1
    has_hot = si("온수_일평균") != -1

    if has_water_single:
        # 안평리: 살수온도 최저/평균/최고 막대(column) 차트
        lbl_water_s = {"value": True, "num_format": "0.0", "font": {"size": 9}}
        c = wb.add_chart({"type": "column"})
        if si("살수온도_최저") != -1:
            c.add_series({
                "name": "최저",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("살수온도_최저"), last_row, si("살수온도_최저")],
                "fill": {"color": "#5DADE2"},
                "data_labels": lbl_water_s,
            })
        c.add_series({
            "name": "평균",
            "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
            "values": ["일별_요약", 1, si("살수온도_일평균"), last_row, si("살수온도_일평균")],
            "fill": {"color": "#1F4E79"},
            "data_labels": lbl_water_s,
        })
        if si("살수온도_최고") != -1:
            c.add_series({
                "name": "최고",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("살수온도_최고"), last_row, si("살수온도_최고")],
                "fill": {"color": "#C0392B"},
                "data_labels": lbl_water_s,
            })
        c.set_title({"name": "살수온도 (℃)", "overlay": False})
        c.set_y_axis({"name": "온도(℃)", "major_gridlines": {"visible": True, "line": {"color": "#E6E6E6"}}})
        c.set_size(summary_chart_size)
        c.set_plotarea(summary_chart_plot)
        _apply_summary_style(c)
        ws.insert_chart("H34", c)
    elif has_gw or has_hot:
        c = wb.add_chart({"type": "column"})
        if has_gw:
            c.add_series({
                "name": "지하수(GW) 평균",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("지하수_일평균"), last_row, si("지하수_일평균")],
                "fill": {"color": "#AED6F1"},
            })
        if has_hot:
            c.add_series({
                "name": "온수(Hot) 평균",
                "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                "values": ["일별_요약", 1, si("온수_일평균"), last_row, si("온수_일평균")],
                "fill": {"color": "#F1948A"},
            })
        c.set_title({"name": "살수온도 비교 (지하수 vs 온수)", "overlay": False})
        c.set_size(summary_chart_size)
        c.set_plotarea(summary_chart_plot)
        _apply_summary_style(c)
        ws.insert_chart("H34", c)

    # ⑥ 외부기온 차트 (B48)
    if si("외부_평균기온") != -1:
        c = wb.add_chart({"type": "line"})
        if si("외부_최고기온") != -1:
            c.add_series({"name": "최고", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("외부_최고기온"), last_row, si("외부_최고기온")],
                          **styles["max"]})
        c.add_series({"name": "평균", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                      "values": ["일별_요약", 1, si("외부_평균기온"), last_row, si("외부_평균기온")],
                      **styles["avg"]})
        if si("외부_최저기온") != -1:
            c.add_series({"name": "최저", "categories": ["일별_요약", 1, idx_date, last_row, idx_date],
                          "values": ["일별_요약", 1, si("외부_최저기온"), last_row, si("외부_최저기온")],
                          **styles["min"]})
        c.set_title({"name": "외부 기온 (℃)", "overlay": False})
        c.set_size(summary_chart_size)
        c.set_plotarea(summary_chart_plot)
        _apply_summary_style(c)
        ws.insert_chart("B48", c)

    current_row = 66

    # 3. 이상 감지 로그
    ws.write(current_row, 1, "3. 전체 이상 감지 로그", fmts["sub_title"])
    current_row += 1
    if not df_alert.empty:
        for c, col in enumerate(df_alert.columns):
            ws.write(current_row, 1 + c, col, fmts["alert_head"])
        current_row += 1
        for r, row in df_alert.iterrows():
            for c, val in enumerate(row):
                ws.write(current_row + r, 1 + c, val, fmts["center"])
        current_row += len(df_alert) + 2
    else:
        ws.write(current_row, 1, "특이사항 없음", fmts["center"])
        current_row += 2

    # 4. 종합 의견
    ws.write(current_row, 1, "4. 종합 의견 및 비고", fmts["sub_title"])
    current_row += 1
    commentary = build_commentary(start_date_str, end_date_str, daily_df, df_alert)
    ws.merge_range(current_row, 1, current_row + 10, 8, commentary, fmts["border"])


# ─── 유틸리티 ──────────────────────────────────────────────

class _SafeIdx:
    """컬럼명으로 안전하게 인덱스를 조회하는 헬퍼."""

    def __init__(self, columns):
        self._cols = list(columns)

    def __call__(self, name):
        try:
            return self._cols.index(name)
        except ValueError:
            return -1
