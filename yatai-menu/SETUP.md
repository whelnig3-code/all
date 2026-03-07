# YATAI Digital Menu - Setup Guide

## 1. Netlify 배포

### 최초 배포
1. https://app.netlify.com 접속 → 회원가입/로그인
2. "Sites" → "Add new site" → "Deploy manually"
3. `yatai-menu` 폴더 전체를 드래그 앤 드롭
4. 배포 완료 → URL 확인 (예: `https://random-name.netlify.app`)

### 사이트 이름 변경
1. Site settings → Site name → 원하는 이름 입력
2. 예: `yatai-menu` → `https://yatai-menu.netlify.app`

### 메뉴 업데이트 후 재배포
1. 태블릿에서 관리모드 → 편집 → "Publish" → `menu.json` 다운로드
2. 다운로드된 `menu.json`을 `yatai-menu/data/` 폴더에 덮어쓰기
3. https://app.netlify.com/drop → 폴더 드래그 앤 드롭
4. ~30초 후 모든 기기에 반영

---

## 2. QR 코드 생성

배포 후 실제 URL로 QR 코드를 재생성합니다:

```bash
cd yatai-menu
python _generate_qr.py https://your-site.netlify.app
```

생성 파일:
- `qr/mobile-menu.png` → 모바일 메뉴 QR
- `qr/gallery.png` → 메뉴판 사진 QR

### A3 메뉴판 인쇄 시
- QR 코드 크기: 최소 3cm × 3cm
- 밝은 배경 위에 배치 권장
- 테스트: 스마트폰 카메라로 스캔 확인

---

## 3. 태블릿 키오스크 모드

### Android 태블릿 (Chrome)

#### 방법 1: Chrome 키오스크 모드 (권장)
1. Chrome 열기 → `https://your-site.netlify.app` 접속
2. 메뉴(⋮) → "홈 화면에 추가" → "YATAI" 이름으로 추가
3. 홈 화면 아이콘 탭 → 전체 화면으로 실행됨

#### 방법 2: 키오스크 앱 사용
1. Play Store에서 "Fully Kiosk Browser" 설치 (무료 버전 가능)
2. URL 입력: `https://your-site.netlify.app`
3. Settings:
   - Web Auto Reload: ON (주기: 3600초 = 1시간)
   - Screen Timeout: Never
   - Swipe to Navigate: OFF
   - Action Bar: Hidden
   - Status Bar: Hidden

#### 방법 3: Android 고정 모드 (Screen Pinning)
1. 설정 → 보안 → 화면 고정 (Screen Pinning) → ON
2. Chrome 열기 → 사이트 접속
3. 최근 앱 버튼 → Chrome 아이콘 → "고정" 탭
4. 해제: 뒤로 + 최근앱 동시 길게 누르기

### iPad (Safari)

1. Safari → `https://your-site.netlify.app` 접속
2. 공유 버튼(⎋) → "홈 화면에 추가"
3. 설정 → 손쉬운 사용 → 유도된 접근 → ON
4. 앱 실행 → 전원 버튼 3번 → 유도된 접근 시작
5. 해제: 전원 버튼 3번 → 암호 입력

---

## 4. 관리자 모드 사용법

1. YATAI 로고를 **3초간 꾹 누르기**
2. PIN 입력 (기본: `0000`)
3. 관리 모드 진입 → 각 메뉴 항목에 ON/OFF, Edit, Delete 버튼 표시

### 메뉴 편집
- **ON/OFF**: 메뉴 숨기기/보이기 (고객에게)
- **Edit**: 이름, 가격, 설명 수정
- **Delete**: 항목 삭제
- **+ Add Item**: 카테고리별 새 항목 추가

### ko/en only 토글
- 관리 바에 `ko/en only` 체크박스
- 체크: 번역 검수 전까지 한국어/영어만 표시
- 해제: 8개 언어 모두 표시

### 변경사항 저장
- **Publish**: `menu.json` 다운로드 → Netlify 재배포
- **Discard**: 편집 내용 전부 취소

### PIN 변경
브라우저 콘솔(F12)에서:
```javascript
MenuAdmin.setPin('1234')
```

---

## 5. 페이지 구성

| URL | 용도 | 대상 |
|-----|------|------|
| `/` (index.html) | 태블릿 메뉴 | 매장 태블릿 |
| `/mobile.html` | 모바일 메뉴 | 고객 스마트폰 |
| `/gallery.html` | 메뉴판 사진 | 고객 스마트폰 |

---

## 6. 문제 해결

### 메뉴가 안 보여요
- 인터넷 연결 확인
- Chrome 캐시 삭제: 설정 → 개인정보 → 인터넷 사용기록 삭제
- 강제 새로고침: Ctrl+Shift+R

### 편집한 내용이 다른 기기에 안 보여요
- 편집 내용은 태블릿 로컬에만 저장됩니다
- "Publish" → `menu.json` 다운로드 → Netlify 재배포 필요

### 장바구니가 초기화됐어요
- 브라우저 캐시/데이터 삭제 시 장바구니도 초기화됩니다
- 장바구니는 주문 참고용이므로 별도 백업 불필요

### QR 코드가 작동 안 해요
- URL이 맞는지 확인 (`_generate_qr.py` 실행 시 URL 확인)
- QR 코드 크기가 너무 작으면 인식 불가 (최소 3cm)
