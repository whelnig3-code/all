#!/bin/bash
# JM Agent Server 상태 확인 및 죽어있으면 재시작

SERVER_DIR="/tmp/jm-server"
LOG_FILE="/tmp/jm-server-auto.log"

check_and_restart() {
  # HTTP 응답 확인
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://localhost:3000/api/agents 2>/dev/null)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "[$(date '+%H:%M:%S')] ✓ 서버 정상 (HTTP $HTTP_CODE)"
  else
    echo "[$(date '+%H:%M:%S')] ✗ 서버 응답 없음 (HTTP $HTTP_CODE) — 재시작 중..." | tee -a "$LOG_FILE"

    # 기존 프로세스 종료
    pkill -f "next dev" 2>/dev/null
    sleep 2

    # 재시작
    cd "$SERVER_DIR" && npm run dev >> "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    echo "[$(date '+%H:%M:%S')] 서버 재시작됨 PID=$NEW_PID" | tee -a "$LOG_FILE"
    sleep 5

    # 재확인
    HTTP_CODE2=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3000/api/agents 2>/dev/null)
    if [ "$HTTP_CODE2" = "200" ]; then
      echo "[$(date '+%H:%M:%S')] ✓ 재시작 성공"
    else
      echo "[$(date '+%H:%M:%S')] ✗ 재시작 후에도 응답 없음" | tee -a "$LOG_FILE"
    fi
  fi
}

# 단발 실행 또는 루프 실행
if [ "$1" = "--watch" ]; then
  echo "워치 모드 시작 (30초마다 체크)"
  while true; do
    check_and_restart
    sleep 30
  done
else
  check_and_restart
fi
