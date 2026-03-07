# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec – 지하수 펌프 유량 분석 시스템."""

import sys
from pathlib import Path

block_cipher = None
BASE = Path(SPECPATH)

a = Analysis(
    [str(BASE / 'main.py')],
    pathex=[str(BASE)],
    binaries=[],
    datas=[
        (str(BASE / 'assets' / 'ci.png'), 'assets'),
    ],
    hiddenimports=[
        'PySide6.QtWidgets',
        'PySide6.QtCore',
        'PySide6.QtGui',
        'pandas',
        'openpyxl',
        'matplotlib',
        'matplotlib.backends.backend_agg',
        'beautifulsoup4',
        'bs4',
        'lxml',
        'lxml.html',
        'watchdog',
        'watchdog.observers',
        'watchdog.events',
        'sqlite3',
        'numpy',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # 서브모듈 자동 수집 비활성화 — 불필요한 패키지 포함 방지
    collect_submodules=[],
    excludes=[
        # 기본 제외 항목
        'tkinter',
        # unittest/test는 pyparsing.testing → matplotlib 의존성이 있어 제외 불가
        # 딥러닝/ML 프레임워크 — 미사용이며 수백 MB 차지
        'torch',
        'torch._C',
        'torch.autograd',
        'torch.cuda',
        'torch.distributions',
        'torch.functional',
        'torch.futures',
        'torch.hub',
        'torch.jit',
        'torch.multiprocessing',
        'torch.nn',
        'torch.optim',
        'torch.utils',
        'torchvision',
        'torchaudio',
        'tensorflow',
        'keras',
        # pyarrow — pandas 선택적 의존성이나 미사용 (79MB)
        'pyarrow',
        'pyarrow.lib',
        'pyarrow.compute',
        'pyarrow.dataset',
        'pyarrow.flight',
        'pyarrow.fs',
        'pyarrow.gandiva',
        'pyarrow.ipc',
        'pyarrow.plasma',
        # 과학 계산 라이브러리 — 미사용
        'scipy',
        'scipy.fft',
        'scipy.integrate',
        'scipy.interpolate',
        'scipy.io',
        'scipy.linalg',
        'scipy.ndimage',
        'scipy.signal',
        'scipy.spatial',
        'scipy.special',
        'scipy.stats',
        # 머신러닝 라이브러리
        'sklearn',
        'sklearn.utils',
        # 컴퓨터 비전
        'cv2',
        # Jupyter/IPython 계열 — 개발 도구, 런타임 불필요
        'IPython',
        'ipykernel',
        'jupyter',
        'notebook',
        'nbconvert',
        'nbformat',
        # 문서 처리 도구 — 미사용
        'docutils',
        # GUI 프레임워크 중복 (PySide6만 사용)
        'wx',
        'gi',
        'PyQt5',
        'PyQt6',
        'curses',
        # 암호화 라이브러리 — 미사용
        'Crypto',
        'cryptography',
        # 이미지 처리 Tk 백엔드 (PySide6 사용으로 불필요)
        'PIL.ImageTk',
        # DB 서버 클라이언트 — sqlite3만 사용, 이하 불필요
        'sqlalchemy',
        'sqlalchemy.*',
        'asyncpg',
        'psycopg2',
        'psycopg2.*',
        'greenlet',
        # 비동기/웹 서버 — 미사용
        'tornado',
        'aiohttp',
        'fastapi',
        'starlette',
        'uvicorn',
        # 기타 미사용 패키지
        'tqdm',
        'psutil',
        'yaml',        # PyYAML (미사용)
        'setuptools',
        'pkg_resources',
        'certifi',     # SSL 인증서 (네트워크 미사용)
        'charset_normalizer',
        # 기타 미사용 표준 라이브러리 (distutils는 PyInstaller 내부 사용으로 제외 불가)
        'xmlrpc',
        'ftplib',
        'imaplib',
        'poplib',
        'smtplib',
        'telnetlib',
        'nntplib',
        'ossaudiodev',
        'spwd',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,    # onefile: 바이너리를 EXE에 직접 포함
    a.zipfiles,    # onefile: zipfile을 EXE에 직접 포함
    a.datas,       # onefile: 데이터 파일을 EXE에 직접 포함
    exclude_binaries=False,  # onefile 방식 — 단일 exe 생성
    name='PumpReporter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,       # GUI 모드 (콘솔 창 숨김)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,           # 아이콘 파일 경로 (선택)
    runtime_tmpdir=None, # onefile: 기본 임시 폴더 사용
)
