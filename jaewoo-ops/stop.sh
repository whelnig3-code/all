#!/bin/bash
# JAEWOO OPS — 시스템 종료 스크립트
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/logs/pids.txt"

if [ -f "$PID_FILE" ]; then
  read BACKEND_PID FRONTEND_PID < "$PID_FILE"
  echo "백엔드 종료 (PID: $BACKEND_PID)..."
  kill "$BACKEND_PID" 2>/dev/null || true
  echo "프론트엔드 종료 (PID: $FRONTEND_PID)..."
  kill "$FRONTEND_PID" 2>/dev/null || true
  rm "$PID_FILE"
  echo "시스템 종료 완료"
else
  # PID 파일 없으면 포트로 종료 시도
  PID=$(netstat -ano 2>/dev/null | grep ":8000 " | awk '{print $5}' | head -1)
  [ -n "$PID" ] && powershell -Command "Stop-Process -Id $PID -Force" 2>/dev/null
  PID=$(netstat -ano 2>/dev/null | grep ":3000 " | awk '{print $5}' | head -1)
  [ -n "$PID" ] && powershell -Command "Stop-Process -Id $PID -Force" 2>/dev/null
  echo "프로세스 종료 완료"
fi
