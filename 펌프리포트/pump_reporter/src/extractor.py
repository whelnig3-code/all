"""HTML 기반 .xls 파일에서 펌프별 유량 데이터 추출.

실제 파일 형식:
  - 확장자 .xls 이지만 내용은 HTML (<table>)
  - Row 0 : 제목 행 (예: <th colspan="5">지하수 펌프별 물량 데이터</th>)
  - Row 1 : 실제 헤더 (예: 일시 | 순간유량(l/s)(지하수펌프1) | ... )
  - Row 2~: 데이터 (5분 간격 타임스탬프, 유량 수치, 빈 셀=결측)
"""
import re
import logging
from io import StringIO
from pathlib import Path
from datetime import datetime

import pandas as pd
from bs4 import BeautifulSoup

from src.database import insert_daily_flows, upsert_pump, get_all_pumps

logger = logging.getLogger(__name__)

# '일시' 컬럼 탐지 키워드 (우선순위순)
DATETIME_KEYWORDS = ["일시", "날짜", "date", "일자", "측정일", "time"]

# 펌프 컬럼에서 펌프 ID를 추출하는 패턴
# 예: "순간유량(l/s)(지하수펌프1)" → "지하수펌프1"
PUMP_NAME_PATTERN = re.compile(r"\(([^()]*펌프[^()]*)\)", re.IGNORECASE)

# 컬럼명에서 건너뛸 키워드
SKIP_COL_KEYWORDS = [
    "일시", "날짜", "date", "일자", "시간", "time", "비고",
    "합계", "total", "평균", "average", "unnamed",
]


# ═══════════════════════════════════════════════════════════
#  공개 API
# ═══════════════════════════════════════════════════════════
def extract_from_file(file_path: str | Path) -> dict[str, pd.DataFrame]:
    """
    HTML-table 기반 .xls 파일을 파싱하여 펌프별 DataFrame 반환.

    Returns:
        {pump_id: DataFrame(columns=[date, hour, flow_m3h, pump_id, source_file])}
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {file_path}")

    content = _read_file_content(file_path)
    source = file_path.name

    # 1차: BeautifulSoup으로 '일시' 헤더 기반 정밀 파싱
    pump_data = _parse_with_bs4(content, source)

    # 2차 fallback: pandas.read_html
    if not pump_data:
        logger.info("BS4 파싱 결과 없음 → pandas.read_html 시도")
        pump_data = _parse_with_pandas(content, source)

    if pump_data:
        total_rows = sum(len(df) for df in pump_data.values())
        logger.info(
            f"추출 완료: {file_path.name} → "
            f"펌프 {len(pump_data)}개, 총 {total_rows:,}행"
        )
        for pid, df in pump_data.items():
            valid = df["flow_m3h"].notna().sum()
            zero_count = (df["flow_m3h"] == 0).sum()
            missing = len(df) - valid
            logger.info(f"  {pid}: {len(df):,}행 (유효 {valid:,}, 결측 {missing:,})")
            # v4.4.x: Data Audit Log
            try:
                from src.logger import data_logger
                data_logger.info({
                    "timestamp": datetime.now().isoformat(),
                    "file_name": file_path.name,
                    "pump_id": pid,
                    "rows_total": len(df),
                    "rows_valid": int(valid),
                    "zero_filtered": int(zero_count),
                    "missing_values": int(missing),
                })
            except Exception:
                pass
    else:
        logger.error(f"데이터를 추출할 수 없습니다: {file_path}")

    return pump_data


def save_extracted_data(pump_data: dict[str, pd.DataFrame]):
    """추출된 데이터를 DB에 저장하고, 미등록 펌프는 자동 등록."""
    existing_pumps = {p["pump_id"] for p in get_all_pumps()}

    for pump_id, df in pump_data.items():
        if pump_id not in existing_pumps:
            upsert_pump(pump_id=pump_id, pump_name=pump_id)
            existing_pumps.add(pump_id)

        records = df.to_dict("records")
        for r in records:
            r["hour"] = int(r.get("hour", 0) or 0)
        insert_daily_flows(records)

    total = sum(len(df) for df in pump_data.values())
    logger.info(f"DB 저장 완료: {len(pump_data)}개 펌프, {total:,}행")


# ═══════════════════════════════════════════════════════════
#  BeautifulSoup 기반 파싱 (주력)
# ═══════════════════════════════════════════════════════════
def _parse_with_bs4(content: str,
                    source_file: str) -> dict[str, pd.DataFrame]:
    """
    BS4로 HTML 테이블을 직접 파싱.

    로직:
      1. 모든 <table>에서 '일시' 키워드가 포함된 헤더 행을 탐색
      2. 제목 행(colspan>1) 자동 건너뛰기
      3. 헤더 행 이후를 데이터로 처리
      4. 일시 → date + hour 분리, 유량 → float, 빈 셀 → NaN
    """
    soup = BeautifulSoup(content, "lxml")
    tables = soup.find_all("table")
    result = {}

    for table in tables:
        rows = table.find_all("tr")
        if len(rows) < 3:
            continue

        # ── 헤더 행 찾기: '일시' 키워드가 있는 행 ──────────
        header_row_idx = None
        headers = []

        for idx, row in enumerate(rows):
            cells = row.find_all(["th", "td"])

            # colspan > 1 인 제목 행은 건너뛰기
            if len(cells) == 1:
                cs = cells[0].get("colspan")
                if cs and int(cs) > 1:
                    continue

            texts = [c.get_text(strip=True) for c in cells]
            if _has_datetime_header(texts):
                header_row_idx = idx
                headers = texts
                break

        if header_row_idx is None:
            continue

        logger.info(
            f"헤더 감지 (Row {header_row_idx}): {headers}"
        )

        # ── 일시 컬럼 인덱스 ──────────────────────────────
        dt_idx = _find_index(headers, DATETIME_KEYWORDS)
        if dt_idx is None:
            continue

        # ── 펌프 컬럼 매핑: {col_idx: pump_id} ───────────
        pump_cols = {}
        for col_idx, col_name in enumerate(headers):
            if col_idx == dt_idx:
                continue
            if _is_skip_column(col_name):
                continue
            pump_id = _extract_pump_id(col_name)
            if pump_id:
                pump_cols[col_idx] = pump_id

        if not pump_cols:
            logger.warning("펌프 컬럼을 찾을 수 없습니다.")
            continue

        logger.info(f"펌프 컬럼: {pump_cols}")

        # ── 데이터 행 파싱 ────────────────────────────────
        data_rows = rows[header_row_idx + 1:]
        for pump_id in pump_cols.values():
            if pump_id not in result:
                result[pump_id] = []

        for row in data_rows:
            cells = row.find_all(["th", "td"])
            if len(cells) < 2:
                continue

            vals = [c.get_text(strip=True) for c in cells]

            # 일시 파싱
            if dt_idx >= len(vals):
                continue
            dt_str = vals[dt_idx]
            parsed_dt = _parse_datetime(dt_str)
            if parsed_dt is None:
                continue

            date_str = parsed_dt.strftime("%Y-%m-%d")
            hour_val = parsed_dt.hour

            # 각 펌프 컬럼 처리
            for col_idx, pump_id in pump_cols.items():
                flow_val = None
                if col_idx < len(vals):
                    raw = vals[col_idx]
                    flow_val = _parse_float(raw)

                result[pump_id].append({
                    "pump_id": pump_id,
                    "date": date_str,
                    "hour": hour_val,
                    "flow_m3h": flow_val,
                    "source_file": source_file,
                })

        # list → DataFrame 변환
        for pump_id in list(result.keys()):
            if isinstance(result[pump_id], list):
                if result[pump_id]:
                    result[pump_id] = pd.DataFrame(result[pump_id])
                else:
                    del result[pump_id]

    return result


# ═══════════════════════════════════════════════════════════
#  pandas.read_html 기반 파싱 (fallback)
# ═══════════════════════════════════════════════════════════
def _parse_with_pandas(content: str,
                       source_file: str) -> dict[str, pd.DataFrame]:
    """pandas.read_html fallback 파서."""
    result = {}

    try:
        tables = pd.read_html(StringIO(content), header=None)
    except Exception as e:
        logger.warning(f"pandas.read_html 실패: {e}")
        return result

    for tbl in tables:
        if tbl.empty or len(tbl.columns) < 2:
            continue

        # 헤더 행 탐색: '일시' 키워드가 있는 행 찾기
        header_row_idx = None
        for idx in range(min(10, len(tbl))):
            row_vals = [str(v).strip() for v in tbl.iloc[idx]]
            if _has_datetime_header(row_vals):
                header_row_idx = idx
                break

        if header_row_idx is None:
            # 기존 컬럼명에서 시도
            col_strs = [str(c).strip() for c in tbl.columns]
            if _has_datetime_header(col_strs):
                header_row_idx = -1  # 컬럼 자체가 헤더

        if header_row_idx is None:
            continue

        # 헤더 설정
        if header_row_idx >= 0:
            headers = [str(v).strip() for v in tbl.iloc[header_row_idx]]
            data_df = tbl.iloc[header_row_idx + 1:].reset_index(drop=True)
            data_df.columns = range(len(data_df.columns))
        else:
            headers = [str(c).strip() for c in tbl.columns]
            data_df = tbl

        # 일시 컬럼
        dt_col = _find_index(headers, DATETIME_KEYWORDS)
        if dt_col is None:
            continue

        # 펌프 컬럼
        pump_cols = {}
        for col_idx, col_name in enumerate(headers):
            if col_idx == dt_col:
                continue
            if _is_skip_column(col_name):
                continue
            pump_id = _extract_pump_id(col_name)
            if pump_id:
                pump_cols[col_idx] = pump_id

        if not pump_cols:
            continue

        # 데이터 변환
        for col_idx, pump_id in pump_cols.items():
            df = pd.DataFrame()
            timestamps = pd.to_datetime(data_df.iloc[:, dt_col], errors="coerce")
            df["date"] = timestamps.dt.strftime("%Y-%m-%d")
            df["hour"] = timestamps.dt.hour
            df["flow_m3h"] = pd.to_numeric(data_df.iloc[:, col_idx], errors="coerce")
            df["pump_id"] = pump_id
            df["source_file"] = source_file
            df = df.dropna(subset=["date"])

            if pump_id in result:
                result[pump_id] = pd.concat(
                    [result[pump_id], df], ignore_index=True)
            else:
                result[pump_id] = df

    return result


# ═══════════════════════════════════════════════════════════
#  유틸리티
# ═══════════════════════════════════════════════════════════
def _read_file_content(file_path: Path) -> str:
    """여러 인코딩을 시도하여 파일 내용을 문자열로 읽기."""
    for enc in ["utf-8", "cp949", "euc-kr", "latin-1"]:
        try:
            return file_path.read_text(encoding=enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return file_path.read_text(encoding="utf-8", errors="replace")


def _has_datetime_header(texts: list[str]) -> bool:
    """텍스트 목록에 일시/날짜 키워드가 있는지 확인."""
    for t in texts:
        t_lower = str(t).lower().strip()
        for kw in DATETIME_KEYWORDS:
            if kw == t_lower or kw in t_lower:
                return True
    return False


def _find_index(headers: list[str], keywords: list[str]):
    """headers에서 keywords 중 하나를 포함하는 인덱스 반환."""
    for i, h in enumerate(headers):
        h_lower = str(h).lower().strip()
        for kw in keywords:
            if kw in h_lower:
                return i
    return None


def _is_skip_column(name: str) -> bool:
    """펌프 데이터가 아닌 컬럼인지 판정."""
    name_lower = str(name).lower().strip()
    if not name_lower:
        return True
    return any(kw in name_lower for kw in SKIP_COL_KEYWORDS)


def _extract_pump_id(col_name: str) -> str:
    """
    컬럼명에서 펌프 ID 추출.

    예시:
      '순간유량(l/s)(지하수펌프1)' → '지하수펌프1'
      '유량(지하수펌프2)'          → '지하수펌프2'
      'PUMP_001'                   → 'PUMP_001'
      '펌프A-3호'                  → '펌프A_3호'
    """
    col_name = str(col_name).strip()
    if not col_name:
        return ""

    # 괄호 안에서 "펌프" 포함 이름 추출 시도
    match = PUMP_NAME_PATTERN.findall(col_name)
    if match:
        # 마지막 매칭이 펌프명일 가능성 높음 (앞쪽 괄호는 단위)
        pump_name = match[-1].strip()
    else:
        # 괄호 패턴 없으면 전체 컬럼명 사용
        pump_name = col_name

    # 날짜/시간 관련이면 건너뛰기
    if _is_skip_column(pump_name):
        return ""

    # ID 정규화: 공백·특수문자 → 언더스코어, 연속 언더스코어 제거
    pump_id = re.sub(r"[^\w가-힣\-]", "_", pump_name)
    pump_id = re.sub(r"_+", "_", pump_id).strip("_")
    return pump_id


def _parse_datetime(text: str) -> datetime | None:
    """
    다양한 날짜/시간 형식 파싱.

    지원 형식:
      - 2025-12-16 08:00:00  (실제 파일 형식)
      - 2025-12-16 08:00
      - 2025/12/16 08:00:00
      - 2025.12.16 08:00
      - 2025-12-16
    """
    text = str(text).strip()
    if not text:
        return None

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y.%m.%d %H:%M:%S",
        "%Y.%m.%d %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    # pandas fallback
    try:
        return pd.to_datetime(text).to_pydatetime()
    except Exception:
        return None


def _parse_float(text: str):
    """문자열을 float로 변환. 빈 문자열·'-'·NaN → None."""
    try:
        text = str(text).strip().replace(",", "")
        if not text or text == "-" or text.lower() == "nan":
            return None
        return float(text)
    except (ValueError, TypeError):
        return None
