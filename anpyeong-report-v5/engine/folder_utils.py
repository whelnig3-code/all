"""
폴더 구조 자동 생성 및 파일명 유틸리티.

v5.2: 재배리포트/{공장}/{YYYY}/{MM}/ 구조를 자동으로 생성한다.
"""

import os
import re
import shutil
from datetime import datetime


def extract_year_month(filename):
    """
    파일명에서 YYYY, MM을 추출한다.

    우선순위:
    1. 연속 숫자: "202601" from "데이터Excel_2026010114.xls"
    2. 구분자: "2026-01" or "2026_01"
    3. 실패: (None, None)

    Returns
    -------
    tuple[str, str] or tuple[None, None]
    """
    # 1순위: YYYYMM 연속
    m = re.search(r"(20\d{2})(0[1-9]|1[0-2])", filename)
    if m:
        return m.group(1), m.group(2)

    # 2순위: YYYY-MM 또는 YYYY_MM
    m = re.search(r"(20\d{2})[-_](0[1-9]|1[0-2])", filename)
    if m:
        return m.group(1), m.group(2)

    return None, None


def extract_year_month_with_fallback(file_path):
    """
    파일명에서 YYYY/MM 추출을 시도하고, 실패 시 파일 수정시간을 사용한다.

    Returns
    -------
    tuple[str, str]
        ("2026", "01")
    """
    filename = os.path.basename(file_path)
    year, month = extract_year_month(filename)
    if year and month:
        return year, month

    mtime = os.path.getmtime(file_path)
    dt = datetime.fromtimestamp(mtime)
    return str(dt.year), f"{dt.month:02d}"


def ensure_folder_structure(root, factory, year, month):
    """
    표준 폴더 구조를 생성하고 경로 딕셔너리를 반환한다.

    {root}/{factory}/{year}/{month}/원본 데이터/
    {root}/{factory}/{year}/{month}/리포트/
    {root}/{factory}/{year}/{month}/logs/

    Returns
    -------
    dict
        {"base": ..., "raw_data": ..., "report": ..., "logs": ...}
    """
    base = os.path.join(root, factory, year, month)
    paths = {
        "base": base,
        "raw_data": os.path.join(base, "원본 데이터"),
        "report": os.path.join(base, "리포트"),
        "logs": os.path.join(base, "logs"),
    }
    for p in paths.values():
        os.makedirs(p, exist_ok=True)
    return paths


def copy_with_dedup(src, dest_dir):
    """
    파일을 대상 디렉토리에 복사한다.
    동일 이름이 존재하면 _(1), _(2) 접미사를 붙인다.

    Returns
    -------
    str
        복사된 파일의 전체 경로
    """
    filename = os.path.basename(src)
    name, ext = os.path.splitext(filename)
    dest = os.path.join(dest_dir, filename)

    counter = 1
    while os.path.exists(dest):
        dest = os.path.join(dest_dir, f"{name}_({counter}){ext}")
        counter += 1

    shutil.copy2(src, dest)
    return dest
