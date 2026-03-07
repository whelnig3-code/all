"""
리포트 다운로드 라우터.

GET /api/report/download  - Excel 리포트 파일 다운로드 (경로 파라미터)
"""

import os
import urllib.parse
import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

router = APIRouter()
logger = logging.getLogger("sunamri")

# 리포트 루트 (batch.py와 동일)
_REPORT_ROOT = os.environ.get(
    "SUNAMRI_REPORT_ROOT",
    os.path.join(os.path.expanduser("~"), "Desktop", "재배리포트"),
)


@router.get("/download")
def download_report(
    path: str = Query(description="리포트 파일 절대 경로"),
):
    """
    Excel 리포트 파일을 다운로드한다.

    보안: REPORT_ROOT 하위 경로만 허용 (디렉토리 트래버설 방지).
    """
    # 경로 정규화 및 보안 검증
    abs_path = os.path.realpath(path)
    allowed_root = os.path.realpath(_REPORT_ROOT)

    if not abs_path.startswith(allowed_root):
        logger.warning(f"허용되지 않은 경로 접근 시도: {path}")
        raise HTTPException(status_code=403, detail="허용되지 않은 경로입니다.")

    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail=f"파일을 찾을 수 없습니다: {os.path.basename(abs_path)}")

    filename = os.path.basename(abs_path)
    encoded_filename = urllib.parse.quote(filename)

    logger.info(f"리포트 다운로드: {filename}")

    return FileResponse(
        path=abs_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
        },
    )
