"""
공장 자동 감지 모듈.

업로드된 파일(경로 + 내용)을 분석해서
안평리(ANPYEONG) / 수남리(SUNAMRI) / 미확정(UNKNOWN) 을 신뢰도 점수 방식으로 판별한다.

[신호 목록]
파일명 / 경로:
  - 파일명에 "안평리" 포함        → ANPYEONG +3
  - 파일명에 "수남리" 포함        → SUNAMRI  +3
  - 파일명에 "라인" 포함          → ANPYEONG +2
  - 경로에 "안평리" 포함          → ANPYEONG +2
  - 경로에 "수남리" 포함          → SUNAMRI  +2

데이터 컬럼:
  - '집수정온도' 컬럼 존재        → ANPYEONG +3  (안평리 고유 집수정)
  - '집수정온도' 컬럼 부재        → SUNAMRI  +1
  - room_id > 5 행 존재           → SUNAMRI  +2  (수남리는 8개 재배사)
  - room_id <= 5 만 존재          → ANPYEONG +1

[임계값]
  - 점수 차이 >= 3 → 확정 (HIGH confidence)
  - 점수 차이 >= 1 → 확정 (MEDIUM confidence)
  - 동점           → UNKNOWN
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional

import pandas as pd

logger = logging.getLogger("sunamri.factory_detector")


class FactoryType(str, Enum):
    ANPYEONG = "anpyeong"   # 안평리
    SUNAMRI = "sunamri"     # 수남리
    UNKNOWN = "unknown"     # 미확정


class Confidence(str, Enum):
    HIGH = "high"       # 점수 차이 >= 3
    MEDIUM = "medium"   # 점수 차이 1~2
    LOW = "low"         # 동점 or UNKNOWN


@dataclass
class DetectionResult:
    factory: FactoryType
    confidence: Confidence
    score_anpyeong: int
    score_sunamri: int
    reasons: list[str]

    @property
    def is_certain(self) -> bool:
        """HIGH 또는 MEDIUM 신뢰도면 True."""
        return self.confidence in (Confidence.HIGH, Confidence.MEDIUM)

    def summary(self) -> str:
        return (
            f"[공장감지] {self.factory.value} "
            f"(안평리:{self.score_anpyeong} / 수남리:{self.score_sunamri} | "
            f"신뢰도:{self.confidence.value}) "
            f"근거: {'; '.join(self.reasons)}"
        )


# ─── 공개 인터페이스 ───────────────────────────────────────

def detect_factory(file_path: str, df: Optional[pd.DataFrame] = None) -> DetectionResult:
    """
    파일 경로(및 선택적으로 DataFrame)를 분석해 공장 유형을 반환한다.

    Parameters
    ----------
    file_path : str
        업로드된 파일의 경로 (파일명에 공장 힌트가 포함될 수 있음)
    df : pd.DataFrame, optional
        이미 로드된 DataFrame. None이면 내부에서 로드를 시도한다.
        로드 실패 시 경로 기반 분석만 수행한다.

    Returns
    -------
    DetectionResult
    """
    score_a = 0   # 안평리 점수
    score_s = 0   # 수남리 점수
    reasons: list[str] = []

    # ── 1. 파일명 / 경로 신호 ─────────────────────────────
    path_obj = Path(file_path)
    fname = path_obj.name.lower()
    fpath = str(file_path).lower().replace("\\", "/")

    if "안평리" in fname:
        score_a += 3
        reasons.append("파일명에 '안평리' 포함(+3)")
    if "수남리" in fname:
        score_s += 3
        reasons.append("파일명에 '수남리' 포함(+3)")
    if "라인" in fname:
        score_a += 2
        reasons.append("파일명에 '라인' 포함(+2 → 안평리)")
    if "안평리" in fpath and "안평리" not in fname:
        score_a += 2
        reasons.append("경로에 '안평리' 포함(+2)")
    if "수남리" in fpath and "수남리" not in fname:
        score_s += 2
        reasons.append("경로에 '수남리' 포함(+2)")

    # ── 2. DataFrame 컬럼 신호 ────────────────────────────
    if df is None:
        df = _try_load(file_path)

    if df is not None:
        _analyze_columns(df, reasons, score_a, score_s)
        # 파이썬 int는 mutable하지 않아 내부함수로 돌려받음
        score_a, score_s = _analyze_columns_scores(df, reasons, score_a, score_s)
    else:
        reasons.append("DataFrame 로드 실패 → 경로 신호만 사용")

    # ── 3. 최종 판정 ──────────────────────────────────────
    diff = abs(score_a - score_s)
    if score_a > score_s:
        factory = FactoryType.ANPYEONG
    elif score_s > score_a:
        factory = FactoryType.SUNAMRI
    else:
        factory = FactoryType.UNKNOWN

    if factory == FactoryType.UNKNOWN:
        confidence = Confidence.LOW
    elif diff >= 3:
        confidence = Confidence.HIGH
    else:
        confidence = Confidence.MEDIUM

    result = DetectionResult(
        factory=factory,
        confidence=confidence,
        score_anpyeong=score_a,
        score_sunamri=score_s,
        reasons=reasons,
    )
    logger.info(result.summary())
    return result


# ─── 내부 헬퍼 ────────────────────────────────────────────

def _try_load(file_path: str) -> Optional[pd.DataFrame]:
    """파일을 DataFrame으로 읽어 반환한다. 실패 시 None."""
    ext = Path(file_path).suffix.lower()
    try:
        # HTML 기반 .xls 파일 감지 (웹 다운로드 시 자주 발생)
        try:
            with open(file_path, "rb") as fh:
                head = fh.read(512).lstrip().lower()
            if head.startswith(b"<html") or b"<table" in head:
                tables = pd.read_html(file_path)
                if tables:
                    df = max(tables, key=len)
                    if isinstance(df.columns, pd.MultiIndex):
                        df.columns = df.columns.get_level_values(-1)
                    return df.head(10)
        except Exception:
            pass

        if ext in (".xls", ".xlsx"):
            for engine in [None, "openpyxl", "xlrd"]:
                try:
                    return pd.read_excel(file_path, header=None, nrows=10, engine=engine)
                except Exception:
                    continue
        elif ext == ".csv":
            for enc in ("utf-8-sig", "euc-kr", "cp949"):
                try:
                    return pd.read_csv(file_path, header=None, nrows=10, encoding=enc)
                except UnicodeDecodeError:
                    continue
        elif ext in (".htm", ".html"):
            tables = pd.read_html(file_path)
            if tables:
                df = max(tables, key=len)
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(-1)
                return df.head(10)
    except Exception as e:
        logger.debug(f"파일 로드 시도 실패 ({ext}): {e}")
    return None


def _find_header_row(df: pd.DataFrame) -> Optional[int]:
    """헤더 행을 추정한다 (한글 셀이 많은 행)."""
    best_row = None
    best_count = 0
    for i, row in df.iterrows():
        kor_count = sum(
            1 for v in row
            if isinstance(v, str) and any("\uAC00" <= ch <= "\uD7A3" for ch in v)
        )
        if kor_count > best_count:
            best_count = kor_count
            best_row = i
    return best_row


def _analyze_columns(df: pd.DataFrame, reasons: list, score_a: int, score_s: int):
    """컬럼 분석 (부작용 없음 - 점수는 _analyze_columns_scores 에서)."""
    pass  # 통합됨


def _analyze_columns_scores(df: pd.DataFrame, reasons: list,
                             score_a: int, score_s: int) -> tuple[int, int]:
    """DataFrame 컬럼을 분석해 신호를 추출하고 점수를 반환한다."""
    header_values = []

    # 1순위: df.columns가 이미 의미있는 이름을 가진 경우 (이미 로딩 완료된 df)
    col_names = [str(c) for c in df.columns if str(c) not in ("nan", "None", "")]
    korean_in_cols = sum(1 for c in col_names
                         if any("가" <= ch <= "힣" for ch in c))
    if korean_in_cols >= 2:
        header_values = col_names
    else:
        # 2순위: 헤더 행을 데이터에서 찾기 (header=None으로 로딩된 경우)
        header_row = _find_header_row(df)
        if header_row is None:
            return score_a, score_s
        header_values = [
            str(v).strip() for v in df.iloc[header_row]
            if isinstance(v, str) or (isinstance(v, float) and not pd.isna(v))
        ]

    if not header_values:
        return score_a, score_s

    # header_row가 설정 안 된 경우(column names 사용 경로) None으로 초기화
    if 'header_row' not in dir():
        header_row = None

    col_text = " ".join(header_values).lower()
    col_joined = "".join(header_values)

    # 집수정온도 → 안평리 고유 컬럼
    if "집수정온도" in col_joined or "집수정" in col_joined:
        score_a += 3
        reasons.append("'집수정온도' 컬럼 발견(+3 → 안평리)")
    else:
        score_s += 1
        reasons.append("'집수정온도' 컬럼 없음(+1 → 수남리)")

    # 라인 컬럼 → 안평리 고유
    if "라인" in col_joined and "재배사" in col_joined:
        score_a += 2
        reasons.append("'라인' + '재배사' 컬럼 발견(+2 → 안평리)")

    # 재배사온도(℃) 컬럼명 → 수남리 고유 (안평리는 "실내온도" 사용)
    if "재배사온도" in col_joined and "실내온도" not in col_joined:
        score_s += 2
        reasons.append("'재배사온도' 컬럼 발견(+2 → 수남리)")
    elif "실내온도" in col_joined and "재배사온도" not in col_joined:
        score_a += 2
        reasons.append("'실내온도' 컬럼 발견(+2 → 안평리)")

    # 지하수 / 온수 → 수남리 고유
    if "지하수" in col_joined or "gw" in col_text:
        score_s += 2
        reasons.append("'지하수' 컬럼 발견(+2 → 수남리)")
    if "온수" in col_joined or "hot" in col_text:
        score_s += 1
        reasons.append("'온수' 컬럼 발견(+1 → 수남리)")

    # 재배사 번호로 추정 (데이터 행에서 최대 재배사 번호 파악)
    room_max = _estimate_max_room(df, header_row)
    if room_max is not None:
        if room_max > 5:
            score_s += 2
            reasons.append(f"재배사 번호 {room_max} > 5 감지(+2 → 수남리 최대 8개)")
        else:
            score_a += 1
            reasons.append(f"재배사 번호 최대 {room_max} ≤ 5(+1 → 안평리 5개)")

    return score_a, score_s


def _estimate_max_room(df: pd.DataFrame, header_row: int) -> Optional[int]:
    """
    데이터에서 재배사 번호의 최댓값을 추정한다.
    파일명이나 데이터 패턴에서 숫자를 추출.
    """
    import re

    max_room = None
    if header_row is None:
        return max_room
    # 헤더 값에서 "N재배사" 패턴 추출
    for v in df.iloc[header_row]:
        if not isinstance(v, str):
            continue
        m = re.search(r"(\d+)\s*재배사", v)
        if m:
            n = int(m.group(1))
            if max_room is None or n > max_room:
                max_room = n

    # 데이터 행에서도 탐색 (헤더 아래 행들)
    if max_room is None:
        for i in range(header_row + 1, min(header_row + 5, len(df))):
            for v in df.iloc[i]:
                if not isinstance(v, str):
                    continue
                m = re.search(r"(\d+)\s*재배사", v)
                if m:
                    n = int(m.group(1))
                    if max_room is None or n > max_room:
                        max_room = n

    return max_room


# ─── 편의 함수: 파이프라인 라우터용 ───────────────────────

def route_to_factory(file_path: str, df: Optional[pd.DataFrame] = None) -> str:
    """
    detect_factory 결과를 문자열 팩토리명으로 반환한다.
    미확정이면 'unknown'을 반환.

    Returns
    -------
    str : 'anpyeong' | 'sunamri' | 'unknown'
    """
    result = detect_factory(file_path, df)
    return result.factory.value
