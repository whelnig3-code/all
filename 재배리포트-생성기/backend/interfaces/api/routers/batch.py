"""
배치(파일 업로드 + 분석) 라우터.

POST /api/batches/upload  - 센서 데이터 파일 업로드 및 분석 실행
GET  /api/batches         - 완료된 배치 목록 조회 (리포트 파일 기반)

[v2] 공장 자동 감지(factory_detector) 통합.
     업로드 파일에서 안평리 / 수남리를 자동 판별해 응답에 포함한다.
     현재는 수남리 파이프라인만 지원하므로, 안평리로 감지 시 경고를 반환한다.
"""

import os
import shutil
import tempfile
import logging
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from application.pipeline import run_pipeline, PipelineError
from application import anpyeong_pipeline
from config.settings import SunamriConfig
from infrastructure.factory_detector import detect_factory, FactoryType

router = APIRouter()
logger = logging.getLogger("sunamri")

# 리포트 저장 루트 (환경변수로 오버라이드 가능)
_REPORT_ROOT = os.environ.get(
    "SUNAMRI_REPORT_ROOT",
    os.path.join(os.path.expanduser("~"), "Desktop", "재배리포트"),
)

# 허용 확장자
_ALLOWED_EXTENSIONS = {".xls", ".xlsx", ".csv"}


@router.post("/detect")
async def detect_factory_only(
    file: Annotated[UploadFile, File(description="센서 데이터 파일 (공장 감지용)")],
):
    """
    파일 업로드 없이 공장 유형만 빠르게 감지한다.
    전체 파이프라인 실행 없이 공장 감지 + 권장 임계값을 반환한다.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"지원되지 않는 파일 형식: {ext}")

    # 공장별 기본 임계값
    _FACTORY_DEFAULTS = {
        "sunamri":  {"limit_prod": 27.0, "limit_co2": 6000.0},
        "anpyeong": {"limit_prod": 28.0, "limit_co2": 10000.0},
        "unknown":  {"limit_prod": 27.0, "limit_co2": 6000.0},
    }

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        detection = detect_factory(tmp_path)
        factory_key = detection.factory.value  # "anpyeong" | "sunamri" | "unknown"
        defaults = _FACTORY_DEFAULTS.get(factory_key, _FACTORY_DEFAULTS["unknown"])

        return JSONResponse({
            "factory": factory_key,
            "confidence": detection.confidence.value,
            "score_anpyeong": detection.score_anpyeong,
            "score_sunamri": detection.score_sunamri,
            "reasons": detection.reasons,
            "limit_prod": defaults["limit_prod"],
            "limit_co2": defaults["limit_co2"],
        })

    except Exception as e:
        logger.warning(f"공장 감지 오류: {e}")
        # 감지 실패 시 수남리 기본값 반환
        return JSONResponse({
            "factory": "unknown",
            "confidence": "low",
            "score_anpyeong": 0,
            "score_sunamri": 0,
            "reasons": [f"감지 실패: {e}"],
            "limit_prod": 27.0,
            "limit_co2": 6000.0,
        })
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


@router.post("/upload")
async def upload_and_analyze(
    file: Annotated[UploadFile, File(description="센서 데이터 파일 (.xls/.xlsx/.csv)")],
    n_trays: Annotated[int, Form(description="시루(트레이) 개수 (10~20)", ge=10, le=20)] = 20,
    factory: Annotated[str, Form(description="공장 강제 지정 (auto/anpyeong/sunamri)")] = "auto",
    limit_prod: Annotated[float, Form(description="품온 경고 상한 (℃)", gt=0, le=50)] = 27.0,
    limit_co2: Annotated[float, Form(description="CO2 경고 상한 (ppm)", gt=0, le=50000)] = 6000.0,
):
    """
    센서 데이터 파일을 업로드하고 분석을 실행한다.

    - factory='auto' (기본): 파일 내용을 분석해 공장 자동 감지
    - factory='sunamri': 수남리 파이프라인 강제 실행
    - factory='anpyeong': 현재 미지원 (경고 반환)

    분석이 완료되면 Excel 리포트 경로, 메타데이터, 감지된 공장 정보를 반환한다.
    """
    config = SunamriConfig()

    # 확장자 검증
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"지원되지 않는 파일 형식입니다: {ext}. 허용: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    # 시루 범위 검증
    n_trays = max(config.TRAY_MIN, min(config.TRAY_MAX, n_trays))

    # 임시 파일로 저장
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        logger.info(f"업로드 파일: {file.filename} ({os.path.getsize(tmp_path):,} bytes)")

        # ── 공장 자동 감지 ──────────────────────────────────────────
        factory_param = (factory or "auto").strip().lower()
        if factory_param == "auto":
            detection = detect_factory(tmp_path)
        else:
            # 사용자 강제 지정
            from infrastructure.factory_detector import DetectionResult, Confidence
            detection = DetectionResult(
                factory=FactoryType(factory_param) if factory_param in ("anpyeong", "sunamri") else FactoryType.UNKNOWN,
                confidence=Confidence.HIGH,
                score_anpyeong=0,
                score_sunamri=0,
                reasons=[f"사용자 강제 지정: {factory_param}"],
            )

        detected_factory = detection.factory
        logger.info(f"공장 감지 결과: {detection.summary()}")

        # 공장별 경고 메시지 (필요시)
        factory_warning = None
        if detected_factory == FactoryType.UNKNOWN:
            factory_warning = "공장 유형을 확정하지 못했습니다. 수남리 파이프라인으로 처리합니다."

        # 파이프라인 실행 (공장별 분기)
        progress_log = []

        def _on_progress(pct: int, msg: str):
            progress_log.append({"pct": pct, "msg": msg})
            logger.info(f"  [{pct:3d}%] {msg}")

        if detected_factory == FactoryType.ANPYEONG:
            logger.info(f"→ 안평리 파이프라인 실행 (신뢰도: {detection.confidence.value})")
            success, output_path, message = anpyeong_pipeline.run_pipeline(
                file_path=tmp_path,
                n_trays=n_trays,
                root_dir=_REPORT_ROOT,
                progress_callback=_on_progress,
                limit_prod=limit_prod,
                limit_co2=limit_co2,
                original_filename=file.filename,  # 임시 경로 대신 원본 파일명으로 라인 번호 감지
            )
        else:
            logger.info(f"→ 수남리 파이프라인 실행 (공장: {detected_factory.value})")
            success, output_path, message = run_pipeline(
                file_path=tmp_path,
                n_trays=n_trays,
                root_dir=_REPORT_ROOT,
                progress_callback=_on_progress,
                limit_prod=limit_prod,
                limit_co2=limit_co2,
                original_filename=file.filename,
            )

        if not success:
            raise HTTPException(status_code=500, detail="리포트 생성 실패")

        return JSONResponse({
            "success": True,
            "message": message,
            "output_path": output_path,
            "filename": os.path.basename(output_path),
            "n_trays": n_trays,
            "progress": progress_log,
            # 공장 감지 정보
            "factory_detection": {
                "factory": detected_factory.value,
                "confidence": detection.confidence.value,
                "score_anpyeong": detection.score_anpyeong,
                "score_sunamri": detection.score_sunamri,
                "reasons": detection.reasons,
                "warning": factory_warning,
            },
        })

    except PipelineError as e:
        logger.error(f"파이프라인 오류: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except PermissionError as e:
        raise HTTPException(
            status_code=423,
            detail=f"파일이 다른 프로그램에서 열려있습니다. 닫고 다시 시도하세요.\n{e}",
        )
    except Exception as e:
        logger.exception(f"예상치 못한 오류: {e}")
        raise HTTPException(status_code=500, detail=f"서버 오류: {type(e).__name__}: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


@router.get("")
def list_batches():
    """
    완료된 배치 목록을 반환한다.

    수남리/ 및 안평리/ 하위 폴더에서 생성된 Excel 리포트 파일을 스캔한다.
    """
    batches = []
    factory_roots = [
        os.path.join(_REPORT_ROOT, "수남리"),
        os.path.join(_REPORT_ROOT, "안평리"),
    ]

    for factory_root in factory_roots:
        if not os.path.isdir(factory_root):
            continue
        for root, dirs, files in os.walk(factory_root):
            # 리포트 폴더만 스캔
            if os.path.basename(root) != "리포트":
                continue
            for fname in sorted(files):
                if not fname.endswith(".xlsx"):
                    continue
                fpath = os.path.join(root, fname)
                stat = os.stat(fpath)
                batches.append({
                    "filename": fname,
                    "path": fpath,
                    "size_kb": round(stat.st_size / 1024, 1),
                    "created_at": stat.st_ctime,
                })

    if not batches:
        return {"batches": [], "total": 0}

    # 최신 순 정렬
    batches.sort(key=lambda x: x["created_at"], reverse=True)

    return {"batches": batches, "total": len(batches)}
