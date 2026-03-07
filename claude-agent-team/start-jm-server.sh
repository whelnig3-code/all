#!/bin/bash
# JM Agent Server 자동 재시작 스크립트
# 서버가 죽으면 5초 후 자동으로 재시작

# 프로젝트 디렉터리 (이 스크립트 위치 기준으로 자동 설정)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/jm-server.log"
PID_FILE="$SCRIPT_DIR/jm-server.pid"
MAX_RETRIES=0  # 0 = 무한 재시도

cd "$SCRIPT_DIR" || { echo "서버 디렉토리 없음: $SCRIPT_DIR"; exit 1; }

echo "=== JM Agent Server 시작 $(date) ===" | tee -a "$LOG_FILE"
echo "디렉터리: $SCRIPT_DIR" | tee -a "$LOG_FILE"

retry_count=0
while true; do
  echo "[$(date '+%H:%M:%S')] 서버 시작 시도 #$((retry_count+1))" | tee -a "$LOG_FILE"

  # 기존 프로세스 종료
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    kill "$OLD_PID" 2>/dev/null
    sleep 1
  fi

  # 서버 시작 (Socket.IO 통합 서버 — next dev + socket.io)
  npm run dev:socket >> "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"
  echo "[$(date '+%H:%M:%S')] 서버 PID=$SERVER_PID" | tee -a "$LOG_FILE"

  # 서버 종료 대기
  wait "$SERVER_PID"
  EXIT_CODE=$?

  retry_count=$((retry_count+1))
  echo "[$(date '+%H:%M:%S')] 서버 종료됨 (exit=$EXIT_CODE). 5초 후 재시작..." | tee -a "$LOG_FILE"

  # 무한 재시도이거나 최대 재시도 미달인 경우
  if [ "$MAX_RETRIES" -gt 0 ] && [ "$retry_count" -ge "$MAX_RETRIES" ]; then
    echo "최대 재시도 횟수($MAX_RETRIES) 초과. 중지." | tee -a "$LOG_FILE"
    break
  fi

  sleep 5
done
