# -*- mode: python ; coding: utf-8 -*-
"""
재배 리포트 생성기 - PyInstaller 스펙 파일

빌드 명령 (build.bat 에서 자동 실행):
  pyinstaller sunamri.spec --noconfirm

출력: dist/재배_리포트생성기.exe  (단일 파일)

[구성]
  - backend/launcher.py         엔트리포인트
  - backend/static/             Next.js 빌드 결과 (build.bat 에서 복사됨)
  - backend/assets/             로고 등 이미지 리소스
  - 의존 패키지: fastapi, uvicorn, pandas, xlsxwriter, meteostat 등
"""

import os
import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

# 프로젝트 루트 (sunamri.spec 이 위치한 디렉터리)
spec_dir = os.path.abspath(SPECPATH)
backend_dir = os.path.join(spec_dir, "backend")
static_dir  = os.path.join(backend_dir, "static")   # Next.js 빌드 결과
assets_dir  = os.path.join(backend_dir, "assets")   # 로고 등

# ── 데이터 파일 ───────────────────────────────────────────────
datas = []

# Next.js 정적 빌드 결과 (필수)
if os.path.isdir(static_dir):
    datas.append((static_dir, "static"))
else:
    print(f"[경고] static/ 디렉터리 없음: {static_dir}")
    print("  build.bat 을 실행하면 자동으로 생성됩니다.")

# 로고 등 에셋 (선택)
if os.path.isdir(assets_dir):
    datas.append((assets_dir, "assets"))

# ── hidden imports ─────────────────────────────────────────────
# FastAPI / Starlette / AnyIO 관련 동적 import 처리
hidden_imports = [
    # uvicorn
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    # FastAPI / Starlette
    "fastapi",
    "starlette",
    "starlette.routing",
    "starlette.middleware",
    "starlette.staticfiles",
    "starlette.responses",
    "anyio",
    "anyio._backends._asyncio",
    "anyio._backends._trio",
    # 데이터 처리
    "pandas",
    "numpy",
    "xlsxwriter",
    "openpyxl",       # pandas의 fallback
    # 날씨 API
    "meteostat",
    "requests",
    # 기타
    "multiprocessing",
    "email.mime.text",
    "email.mime.multipart",
    # 프로젝트 내부 모듈 (동적 import 방지)
    "config.settings",
    "domain.alert.detection_service",
    "domain.sensor.analysis_service",
    "domain.watering.schedule_service",
    "domain.weather.resolution_service",
    "domain.report.commentary_service",
    "infrastructure.file_processing.loader",
    "infrastructure.file_processing.header_mapper",
    "infrastructure.weather.meteostat_client",
    "infrastructure.storage.folder_utils",
    "infrastructure.excel.report_builder",
    "infrastructure.factory_detector",
    "application.pipeline",
    "interfaces.api.main",
    "interfaces.api.routers.batch",
    "interfaces.api.routers.report",
]

# collect_all 로 전체 패키지 수집
_extra_datas, _extra_binaries, _extra_hiddenimports = [], [], []
for pkg in ["fastapi", "starlette", "uvicorn", "anyio"]:
    d, b, h = collect_all(pkg)
    _extra_datas    += d
    _extra_binaries += b
    _extra_hiddenimports += h

datas    += _extra_datas
hidden_imports += _extra_hiddenimports

# ── 분석 ─────────────────────────────────────────────────────
a = Analysis(
    [os.path.join(backend_dir, "launcher.py")],
    pathex=[backend_dir],
    binaries=_extra_binaries,
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",    # GUI 툴킷 불필요
        "matplotlib", # 차트는 xlsxwriter 사용
        "scipy",
        "sklearn",
        "IPython",
        "jupyter",
        "notebook",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# ── 단일 exe 생성 ─────────────────────────────────────────────
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="재배_리포트생성기",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,                # UPX 압축 (있으면 적용)
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,            # True: 콘솔 창 표시 (로그 확인용)
                             # False: 콘솔 없이 백그라운드 실행
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # Windows 아이콘 (assets/icon.ico 가 있으면 적용)
    icon=os.path.join(assets_dir, "icon.ico") if os.path.isfile(
        os.path.join(assets_dir, "icon.ico")
    ) else None,
)
