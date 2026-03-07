"""
폴더 구조 자동 생성 및 파일명 유틸리티.

안평리 engine/folder_utils.py 에서 이식.
수남리: 폴더 경로에서 "안평리" 대신 "수남리" 사용.
"""

import os
import re
import shutil
from datetime import datetime


def extract_year_month(filename):
    """파일명에서 YYYY, MM을 추출한다."""
    m = re.search(r"(20\d{2})(0[1-9]|1[0-2])", filename)
    if m:
        return m.group(1), m.group(2)
    m = re.search(r"(20\d{2})[-_](0[1-9]|1[0-2])", filename)
    if m:
        return m.group(1), m.group(2)
    return None, None


def extract_year_month_with_fallback(file_path):
    """파일명에서 YYYY/MM 추출 실패 시 수정시간 사용."""
    filename = os.path.basename(file_path)
    year, month = extract_year_month(filename)
    if year and month:
        return year, month
    mtime = os.path.getmtime(file_path)
    dt = datetime.fromtimestamp(mtime)
    return str(dt.year), f"{dt.month:02d}"


def ensure_folder_structure(root, year, month, factory_name: str = "수남리"):
    """
    표준 폴더 구조를 생성하고 경로 딕셔너리를 반환한다.

    {root}/{factory_name}/{year}년 {month}월/원본 데이터/
    {root}/{factory_name}/{year}년 {month}월/리포트/
    {root}/{factory_name}/{year}년 {month}월/logs/

    year : str 또는 int  (예: "2025" 또는 2025)
    month: str 또는 int  (예: "12" 또는 12)
    """
    date_folder = f"{int(year)}년 {int(month)}월"
    base = os.path.join(root, factory_name, date_folder)
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
    """파일을 대상 디렉토리에 복사한다. 동일 이름 존재 시 _(n) 접미사 추가."""
    filename = os.path.basename(src)
    name, ext = os.path.splitext(filename)
    dest = os.path.join(dest_dir, filename)
    counter = 1
    while os.path.exists(dest):
        dest = os.path.join(dest_dir, f"{name}_({counter}){ext}")
        counter += 1
    shutil.copy2(src, dest)
    return dest
