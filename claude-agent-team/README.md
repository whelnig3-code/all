# JM Agent Team 대시보드

Claude Code 에이전트 팀 운영 대시보드. Multi-Hop 체인 실행, 실시간 에이전트 모니터링, 채팅 인터페이스를 제공합니다.

## 환경 요구사항

> **운영 환경에서는 Node LTS 사용 권장** (현재 Node 22 LTS "Jod")

| 항목 | 버전 |
|------|------|
| Node.js | **22.x LTS** 이상 (`.nvmrc` 참고) |
| npm    | 10.x 이상 |

```bash
# nvm 사용 시 (권장)
nvm install 22
nvm use          # .nvmrc 자동 적용
node --version   # v22.x.x 확인
```

## 빠른 시작

```bash
# 의존성 설치
npm install

# 개발 서버 (Socket.IO 포함)
node start-server.js

# 또는 Windows 더블클릭
start-jm-server.bat
```

서버 주소: `http://localhost:3000`

## 운영 배포 (PM2)

```bash
npm install -g pm2

# 개발 모드
pm2 start ecosystem.config.js

# 운영 모드 (.env.production 자동 로드)
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

## 환경변수 구성

| 파일 | 용도 | Git |
|------|------|-----|
| `.env.production` | 운영 기본값 (비밀 없음) | ✅ 추적됨 |
| `.env.local` | 머신별 비밀 + 경로 설정 | ❌ gitignore |

### `.env.local` 최소 설정 (집 PC / 회사 PC 각각)

```bash
# 머신별 경로
PROJECT_BASE_DIR=C:/경로/claude-agent-team
PORT=3000

# 외부 접속 인증 (필수)
DASHBOARD_SECRET=강력한_랜덤_시크릿

# Cloudflare Tunnel (외부 접속 시)
ENABLE_REMOTE_ACCESS=true

# Phase 3 LLM (실험 시만 활성화)
# ANTHROPIC_API_KEY=sk-ant-...
# ENABLE_LLM_CANDIDATE=true
```

## 프로젝트 관리

```bash
# Git 동기화 프로젝트 생성
node scripts/create-project.ts my-feature

# 로컬 전용 프로젝트 생성 (Git 미추적)
node scripts/create-project.ts my-exp local
```

## 문서

- [`docs/plan.md`](docs/plan.md) — 현재 아키텍처 & 구현 계획
- [`scripts/`](scripts/) — 유틸리티 스크립트

## 기술 스택

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Backend**: Node.js 22 + Socket.IO 4
- **에이전트**: Claude Code SDK (Multi-Hop 체인)
- **배포**: PM2 + Cloudflare Quick Tunnel
