# Smartstore Automation — 서비스 가입 및 설정 가이드

> 이 문서는 시스템 운영에 필요한 모든 외부 서비스 가입/설정 절차를 안내합니다.
> 작성일: 2026-03-09

---

## 목차

1. [필수 서비스 (반드시 설정)](#1-필수-서비스)
2. [선택 서비스 (필요 시 설정)](#2-선택-서비스)
3. [환경변수 전체 목록](#3-환경변수-전체-목록)
4. [.env 파일 템플릿](#4-env-파일-템플릿)

---

## 1. 필수 서비스

### 1-1. 네이버 커머스 API (핵심 — 상품등록/주문/발송)

**가입 사이트**: https://commerce.naver.com

**절차**:
1. **스마트스토어 개설**
   - https://sell.smartstore.naver.com 접속
   - 네이버 아이디로 로그인
   - 판매자 정보 입력 (사업자등록번호, 통신판매업 신고번호)
   - 정산 계좌 등록
   - 심사 승인 대기 (1~3 영업일)

2. **커머스 API 키 발급**
   - https://apicenter.commerce.naver.com 접속
   - [애플리케이션 등록] 클릭
   - 애플리케이션 이름: `smartstore-automation`
   - API 권한 선택:
     - ✅ 상품 API (등록/수정/삭제)
     - ✅ 주문 API (조회/발송처리)
     - ✅ 정산 API (매출 조회)
     - ✅ 취소/반품 API
   - 등록 완료 후 발급되는 값:
     - `Client ID` → 환경변수 `NAVER_CLIENT_ID`
     - `Client Secret` → 환경변수 `NAVER_CLIENT_SECRET`

3. **Shop ID 확인**
   - 스마트스토어 판매자센터 → 내 정보 → 판매자 ID 확인
   - 또는 API 호출로 확인 가능
   - → 환경변수 `NAVER_SHOP_ID`

**환경변수**:
```env
NAVER_CLIENT_ID=발급받은_Client_ID
NAVER_CLIENT_SECRET=발급받은_Client_Secret
NAVER_SHOP_ID=판매자_Shop_ID
NAVER_COMMERCE_API_BASE_URL=https://api.commerce.naver.com
```

---

### 1-2. 텔레그램 봇 (알림/승인 — 무료)

**가입 사이트**: https://telegram.org

**절차**:
1. **텔레그램 앱 설치** (PC/모바일)

2. **봇 생성**
   - 텔레그램에서 `@BotFather` 검색 → 대화 시작
   - `/newbot` 입력
   - 봇 이름 입력: `Smartstore Alert Bot`
   - 봇 사용자명 입력: `smartstore_alert_bot` (고유해야 함)
   - 발급되는 토큰 복사 → 환경변수 `TELEGRAM_BOT_TOKEN`
   - 형식: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`

3. **채팅 ID 확인**
   - 생성한 봇과 대화 시작 (아무 메시지 전송)
   - 브라우저에서 접속: `https://api.telegram.org/bot{토큰}/getUpdates`
   - 응답의 `result[0].message.chat.id` 값 복사
   - → 환경변수 `TELEGRAM_CHAT_ID`

**환경변수**:
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=123456789
```

---

### 1-3. PostgreSQL 데이터베이스

**설치 방법** (택 1):

#### A. 로컬 설치 (개발용)
```bash
# Windows - 공식 인스톨러
# https://www.postgresql.org/download/windows/ 에서 다운로드
# 설치 시 비밀번호 설정 기억

# DB 생성
psql -U postgres
CREATE DATABASE smartstore;
\q
```

#### B. Docker 설치 (권장)
```bash
docker run -d \
  --name smartstore-db \
  -e POSTGRES_USER=smartstore \
  -e POSTGRES_PASSWORD=your_strong_password \
  -e POSTGRES_DB=smartstore \
  -p 5432:5432 \
  postgres:16
```

#### C. 클라우드 (프로덕션)
- **Supabase** (무료 플랜): https://supabase.com
- **Neon** (무료 플랜): https://neon.tech
- **AWS RDS**: https://aws.amazon.com/rds/

**환경변수**:
```env
DATABASE_URL=postgresql://smartstore:your_strong_password@localhost:5432/smartstore
```

---

### 1-4. Redis (작업 큐)

**설치 방법** (택 1):

#### A. Docker (권장)
```bash
docker run -d \
  --name smartstore-redis \
  -p 6379:6379 \
  redis:7-alpine
```

#### B. Windows 설치
- https://github.com/tporadowski/redis/releases 에서 다운로드
- 또는 WSL2에서 `sudo apt install redis-server`

#### C. 클라우드
- **Upstash** (무료 플랜): https://upstash.com
- **Redis Cloud**: https://redis.com/cloud/

**환경변수**:
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # 로컬이면 비워도 됨
```

---

### 1-5. Ollama (AI 콘텐츠 생성 — 무료, 로컬)

**설치 사이트**: https://ollama.com

**절차**:
1. https://ollama.com/download 에서 설치
2. 모델 다운로드:
   ```bash
   ollama pull llama3.2        # 기본 모델 (약 2GB)
   # 또는
   ollama pull mistral-nemo    # 대안 모델
   ```
3. 서버 자동 시작 확인: `http://localhost:11434` 접속

**환경변수**:
```env
LLM_ADAPTER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

---

### 1-6. 암호화 마스터 키 (보안)

**직접 생성** (가입 불필요):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

출력된 64자리 문자열을 환경변수에 설정.

**환경변수**:
```env
MASTER_ENCRYPTION_KEY=생성된_64자리_hex_문자열
```

> ⚠️ **절대 분실/유출 금지**: 이 키로 고객 전화번호, 서비스 자격증명이 암호화됩니다.
> 키를 잃으면 암호화된 데이터를 복호화할 수 없습니다.

---

### 1-7. 관리자 계정 (내부 API)

**직접 설정** (가입 불필요):
```env
ADMIN_USER=admin
ADMIN_PASS=매우_강력한_비밀번호_여기에
ADMIN_PROXY_TOKEN=대시보드_프록시_토큰_hex
NEXT_PUBLIC_ADMIN_PROXY_TOKEN=위와_동일한_값
```

프록시 토큰 생성:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## 2. 선택 서비스

### 2-1. 네이버 블로그 API (SEO 자동 포스팅)

**가입 사이트**: https://developers.naver.com

**절차**:
1. https://developers.naver.com/apps 접속
2. [Application 등록] 클릭
3. 사용 API: `블로그` 선택
4. 로그인 오픈 API 서비스 환경: `WEB` → Callback URL: `http://localhost:3000/callback`
5. 등록 완료 후 Client ID/Secret 확인
6. **OAuth 인증 1회 진행** (브라우저에서):
   ```
   https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id={CLIENT_ID}&redirect_uri=http://localhost:3000/callback&state=random
   ```
7. 리다이렉트된 URL에서 `code` 파라미터 추출
8. 토큰 교환:
   ```bash
   curl "https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id={ID}&client_secret={SECRET}&code={CODE}&state=random"
   ```
9. 응답의 `access_token` 값 저장

**환경변수**:
```env
NAVER_BLOG_ACCESS_TOKEN=발급받은_access_token
BLOG_POSTING_ENABLED=true
BLOG_DAILY_LIMIT=20
```

---

### 2-2. 도매꾹 (국내 도매 공급처)

**가입 사이트**: https://domeggook.com

**절차**:
1. https://domeggook.com 접속 → 회원가입
2. 사업자회원으로 가입 (개인도 가능하지만 사업자 권장)
3. 로그인 후 상품 검색 가능 확인

**환경변수**:
```env
DOMAEGGUK_USERNAME=가입한_아이디
DOMAEGGUK_PASSWORD=가입한_비밀번호
```

---

### 2-3. 오너클랜 (국내 도매 공급처)

**가입 사이트**: https://www.ownerclan.com

**절차**:
1. https://www.ownerclan.com 접속 → 회원가입
2. 셀러 회원으로 가입
3. 로그인 후 상품 조회 가능 확인

**환경변수**:
```env
OWNERCLAN_USERNAME=가입한_아이디
OWNERCLAN_PASSWORD=가입한_비밀번호
```

---

### 2-4. OpenAI API (프리미엄 AI — 유료)

**가입 사이트**: https://platform.openai.com

**절차**:
1. https://platform.openai.com/signup 가입
2. 결제 수단 등록 (신용카드)
3. https://platform.openai.com/api-keys 에서 API 키 생성
4. 월 예산 제한 설정 권장 (Settings → Billing → Usage limits)

**비용**: gpt-4o-mini 기준 약 $0.15/100만 토큰 (매우 저렴)

**환경변수**:
```env
LLM_ADAPTER=openai
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
```

---

### 2-5. ExchangeRate API (환율 조회 — 구매대행용)

**가입 사이트**: https://www.exchangerate-api.com

**절차**:
1. https://www.exchangerate-api.com 가입 (이메일만 필요)
2. 무료 플랜: 월 1,500회 (충분)
3. 대시보드에서 API Key 확인

**환경변수**:
```env
EXCHANGE_RATE_API_KEY=발급받은_api_key
```

---

### 2-6. 알리익스프레스 / 타오바오 (구매대행 — Phase 5)

**별도 API 키 불필요** — 웹 크롤링 방식

**알리익스프레스**: https://www.aliexpress.com 계정 생성 (선택)
**타오바오**: https://www.taobao.com 계정 생성 + 로그인 쿠키 필요

**환경변수**:
```env
SOURCING_ALIEXPRESS_ENABLED=false   # true로 변경 시 활성화
SOURCING_TAOBAO_ENABLED=false       # true로 변경 시 활성화
```

---

## 3. 환경변수 전체 목록

| 변수명 | 필수 | 설명 | 예시 |
|--------|------|------|------|
| **핵심 인프라** ||||
| `DATABASE_URL` | ✅ | PostgreSQL 연결 | `postgresql://user:pass@localhost:5432/smartstore` |
| `REDIS_HOST` | ✅ | Redis 호스트 | `localhost` |
| `REDIS_PORT` | ✅ | Redis 포트 | `6379` |
| `REDIS_PASSWORD` | | Redis 비밀번호 | |
| `MASTER_ENCRYPTION_KEY` | ✅ | AES-256 암호화 키 (64자 hex) | `a1b2c3...` |
| **네이버 커머스** ||||
| `NAVER_CLIENT_ID` | ✅ | API Client ID | |
| `NAVER_CLIENT_SECRET` | ✅ | API Client Secret | |
| `NAVER_SHOP_ID` | ✅ | 스마트스토어 Shop ID | |
| `NAVER_COMMERCE_API_BASE_URL` | | API 기본 URL | `https://api.commerce.naver.com` |
| **네이버 블로그** ||||
| `NAVER_BLOG_ACCESS_TOKEN` | | OAuth 토큰 | |
| `BLOG_POSTING_ENABLED` | | 블로그 포스팅 활성화 | `false` |
| `BLOG_DAILY_LIMIT` | | 일일 포스팅 한도 | `20` |
| **텔레그램** ||||
| `TELEGRAM_BOT_TOKEN` | ✅ | 봇 API 토큰 | `123456:ABC...` |
| `TELEGRAM_CHAT_ID` | ✅ | 알림 채팅 ID | `123456789` |
| **AI/LLM** ||||
| `LLM_ADAPTER` | | LLM 선택 | `ollama` / `openai` |
| `OLLAMA_BASE_URL` | | Ollama 서버 URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | | Ollama 모델 | `llama3.2` |
| `OPENAI_API_KEY` | | OpenAI API 키 | `sk-proj-...` |
| `OPENAI_MODEL` | | OpenAI 모델 | `gpt-4o-mini` |
| **관리자** ||||
| `ADMIN_USER` | ✅ | 관리 API 사용자명 | `admin` |
| `ADMIN_PASS` | ✅ | 관리 API 비밀번호 | 강력한 비밀번호 |
| `ADMIN_PROXY_TOKEN` | ✅ | 대시보드 프록시 토큰 | hex 문자열 |
| `NEXT_PUBLIC_ADMIN_PROXY_TOKEN` | ✅ | 브라우저용 프록시 토큰 | 위와 동일 |
| **공급처** ||||
| `DOMAEGGUK_USERNAME` | | 도매꾹 아이디 | |
| `DOMAEGGUK_PASSWORD` | | 도매꾹 비밀번호 | |
| `OWNERCLAN_USERNAME` | | 오너클랜 아이디 | |
| `OWNERCLAN_PASSWORD` | | 오너클랜 비밀번호 | |
| **구매대행 (Phase 5)** ||||
| `EXCHANGE_RATE_API_KEY` | | 환율 API 키 | |
| `SOURCING_ALIEXPRESS_ENABLED` | | 알리 크롤러 활성화 | `false` |
| `SOURCING_TAOBAO_ENABLED` | | 타오바오 크롤러 활성화 | `false` |
| **Kill Switch** ||||
| `AUTO_PRICE_ENABLED` | | 자동 가격 조정 | DB 설정 |
| `AUTO_ORDER_ENABLED` | | 자동 주문 처리 | DB 설정 |
| `AUTO_SHIPPING_ENABLED` | | 자동 발송 처리 | DB 설정 |

---

## 4. .env 파일 템플릿

프로젝트 루트에 `.env` 파일 생성 후 아래 내용을 복사하여 값을 채우세요.

```env
# ==========================================
# Smartstore Automation — 환경변수 설정
# ==========================================

# --- 핵심 인프라 ---
DATABASE_URL=postgresql://smartstore:your_password@localhost:5432/smartstore
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# --- 보안 ---
MASTER_ENCRYPTION_KEY=    # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_USER=admin
ADMIN_PASS=               # 매우 강력한 비밀번호
ADMIN_PROXY_TOKEN=        # node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
NEXT_PUBLIC_ADMIN_PROXY_TOKEN=  # 위 ADMIN_PROXY_TOKEN과 동일 값

# --- 네이버 커머스 API ---
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
NAVER_SHOP_ID=
NAVER_COMMERCE_API_BASE_URL=https://api.commerce.naver.com

# --- 텔레그램 알림 ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# --- AI 콘텐츠 생성 ---
LLM_ADAPTER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
# OPENAI_API_KEY=         # OpenAI 사용 시 LLM_ADAPTER=openai로 변경
# OPENAI_MODEL=gpt-4o-mini

# --- 네이버 블로그 (선택) ---
# NAVER_BLOG_ACCESS_TOKEN=
BLOG_POSTING_ENABLED=false
BLOG_DAILY_LIMIT=20

# --- 공급처 계정 (선택) ---
# DOMAEGGUK_USERNAME=
# DOMAEGGUK_PASSWORD=
# OWNERCLAN_USERNAME=
# OWNERCLAN_PASSWORD=

# --- 구매대행 Phase 5 (선택) ---
# EXCHANGE_RATE_API_KEY=
SOURCING_ALIEXPRESS_ENABLED=false
SOURCING_TAOBAO_ENABLED=false
```

---

## 빠른 시작 체크리스트

1. [ ] PostgreSQL 설치 + DB 생성
2. [ ] Redis 설치
3. [ ] `.env` 파일 생성 (위 템플릿 복사)
4. [ ] 암호화 키 생성 → `MASTER_ENCRYPTION_KEY`
5. [ ] 관리자 비밀번호 설정 → `ADMIN_PASS`
6. [ ] 프록시 토큰 생성 → `ADMIN_PROXY_TOKEN` + `NEXT_PUBLIC_ADMIN_PROXY_TOKEN`
7. [ ] 네이버 스마트스토어 개설 + API 키 발급
8. [ ] 텔레그램 봇 생성 + 채팅 ID 확인
9. [ ] Ollama 설치 + 모델 다운로드
10. [ ] DB 마이그레이션: `npm run db:push`
11. [ ] 초기 설정: `npm run db:seed-settings`
12. [ ] 서버 시작: `npm run dev`
