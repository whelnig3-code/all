#!/bin/bash
# JAEWOO OPS — 전체 시스템 시작 스크립트
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_LOG="$SCRIPT_DIR/logs/backend.log"
FRONTEND_LOG="$SCRIPT_DIR/logs/frontend.log"

mkdir -p "$SCRIPT_DIR/logs"

echo "================================================"
echo "   JAEWOO OPS v1.3.0 — Phase 1 (Excel Mode)"
echo "================================================"

# 백엔드 실행
echo "[1/2] 백엔드 서버 시작 중... (FastAPI :8000)"
cd "$BACKEND_DIR"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "      PID: $BACKEND_PID"

# 준비 대기
sleep 3
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
  echo "[ERROR] 백엔드 시작 실패. 로그 확인: $BACKEND_LOG"
  exit 1
fi
echo "      OK: http://localhost:8000"

# 프론트엔드 실행
echo "[2/2] 프론트엔드 서버 시작 중... (Node.js :3000)"
cd "$FRONTEND_DIR"
API_BASE=http://localhost:8000 node src/index.js > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "      PID: $FRONTEND_PID"

sleep 2
echo ""
echo "================================================"
echo "  시스템 시작 완료!"
echo ""
echo "  관리자 대시보드:  http://localhost:3000"
echo "  API Swagger:      http://localhost:8000/docs"
echo "  헬스체크:         http://localhost:8000/health"
echo ""
echo "  [Ctrl+C] 종료"
echo "================================================"

# PID 파일 저장 (stop.sh용)
echo "$BACKEND_PID $FRONTEND_PID" > "$SCRIPT_DIR/logs/pids.txt"

# 프로세스 유지
wait
