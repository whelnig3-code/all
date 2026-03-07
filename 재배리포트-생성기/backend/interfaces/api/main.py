"""
수남리 리포트 생성기 - FastAPI 애플리케이션 엔트리포인트.

[패키징 모드 (exe)]
  - frontend/out/ 를 backend/static/ 으로 복사 후 빌드
  - FastAPI가 /  경로에서 정적 파일(Next.js 빌드 결과)을 서빙
  - 브라우저에서 http://localhost:<port> 로 접근

[개발 모드]
  - `uvicorn interfaces.api.main:app --reload --port 8000`
  - Next.js는 별도로 `npm run dev` (port 3000)
"""

import logging
import os
import sys

# 프로젝트 루트(backend/)를 sys.path에 추가
_BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _BASE not in sys.path:
    sys.path.insert(0, _BASE)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from interfaces.api.routers import batch, report

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sunamri")

app = FastAPI(
    title="수남리 숙주 재배 리포트 API",
    description="센서 데이터 업로드 → 자동 분석 → Excel 리포트 다운로드",
    version="1.0.0",
)

# ── CORS: 개발 모드에서만 필요 (Next.js dev server 허용) ──────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API 라우터 ─────────────────────────────────────────────────
app.include_router(batch.router, prefix="/api/batches", tags=["배치"])
app.include_router(report.router, prefix="/api/report", tags=["리포트"])


@app.get("/api/health", tags=["시스템"])
def health_check():
    return {"status": "ok", "service": "sunamri-report"}


# ── 정적 파일 서빙 (패키징 모드 / 개발 선택) ──────────────────
def _get_static_dir() -> str | None:
    """
    Next.js 정적 빌드 결과 디렉터리 경로를 반환한다.
    - PyInstaller exe 모드: sys._MEIPASS/static
    - 일반 실행 모드:       backend/static   (복사가 이미 완료된 경우)
    """
    if getattr(sys, "frozen", False):
        # PyInstaller 번들 내부
        return os.path.join(sys._MEIPASS, "static")

    # 개발/직접 실행 모드: backend/ 하위에 static/ 이 있으면 서빙
    candidate = os.path.join(_BASE, "static")
    if os.path.isdir(candidate):
        return candidate

    return None


_static_dir = _get_static_dir()

if _static_dir:
    logger.info(f"정적 파일 서빙 활성화: {_static_dir}")

    # /  경로에 SPA fallback (index.html)
    # API 라우트(/api/...)는 위에 먼저 등록되어 있으므로 우선순위 유지됨
    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(os.path.join(_static_dir, "index.html"))

    # Next.js trailingSlash=true → 각 경로에 index.html 생성됨
    # 정적 에셋(JS/CSS/이미지) 서빙
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
else:
    logger.info("정적 파일 디렉터리 없음 → API 전용 모드 (개발 중)")
