"""
데이터 파일 로딩 모듈.

안평리 engine/loader.py 에서 이식 (동일).
지원 형식: HTML(.xls 웹 저장), Excel(.xls/.xlsx), CSV/Text
"""

import pandas as pd


def load_raw_dataframe(file_path):
    """
    파일을 읽어 원본 DataFrame을 반환한다.
    헤더 처리 없이 header=None 으로 읽는다.
    """
    head = _read_file_head(file_path, 2048)
    head_lower = head.lstrip().lower()

    if head_lower.startswith(b"<html") or b"<table" in head_lower:
        df = _try_html(file_path)
        if df is not None:
            return df

    df = _try_excel(file_path)
    if df is not None:
        return df

    df = _try_csv(file_path)
    if df is not None:
        return df

    raise ValueError("파일을 읽을 수 없습니다. (지원되지 않는 형식이거나 깨진 파일)")


def _read_file_head(file_path, size):
    try:
        with open(file_path, "rb") as f:
            return f.read(size)
    except Exception:
        return b""


def _try_html(file_path):
    try:
        dfs = pd.read_html(file_path, header=None)
        if dfs:
            df = max(dfs, key=len)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(-1)
            return df
    except ImportError as e:
        raise ImportError(
            "HTML 테이블로 저장된 .xls 파일입니다.\n"
            "해결: pip install lxml beautifulsoup4 html5lib\n"
            f"(원인: {e})"
        )
    except Exception:
        pass
    return None


def _try_excel(file_path):
    for engine in [None, "openpyxl", "xlrd"]:
        try:
            return pd.read_excel(file_path, header=None, engine=engine)
        except Exception:
            continue
    return None


def _try_csv(file_path):
    for enc in ["utf-8-sig", "cp949", "euc-kr", "utf-16"]:
        try:
            return pd.read_csv(
                file_path, header=None, sep=None, engine="python", encoding=enc,
            )
        except Exception:
            continue
    return None
