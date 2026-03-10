# 스마트스토어 상세페이지 디자인 & 카피라이팅 가이드

> 네이버 스마트스토어 상품 등록 시 HTML 상세설명 영역에 적용하는 실전 가이드

---

## 1. 상세페이지 구성 공식 (스크롤 순서)

모바일 사용자 80%를 기준으로, **위에서 아래로 스크롤하며 읽는 흐름**에 맞춘 9단계 구조.

### 표준 구성 순서

```
┌─────────────────────────────────────┐
│  1단계: 후킹 배너 (첫 화면)          │  ← 3초 안에 이탈/체류 결정
│  - 핵심 USP 한 줄                    │
│  - 대표 상품 이미지                   │
│  - 프로모션/혜택 (무료배송, 할인 등)   │
├─────────────────────────────────────┤
│  2단계: 문제 제기 / 공감              │  ← "이런 경험 있으시죠?"
│  - 고객의 불편/고민을 구체적으로 묘사  │
│  - 감정 자극 (공감 형성)              │
├─────────────────────────────────────┤
│  3단계: 해결책 제시 (USP)             │  ← "그래서 만들었습니다"
│  - 핵심 차별점 1~3가지               │
│  - 경쟁 제품과의 비교 (간접적)        │
│  - 수치/데이터로 근거 제시            │
├─────────────────────────────────────┤
│  4단계: 상품 상세 이미지              │  ← 제품의 실물감
│  - 다각도 촬영 사진                   │
│  - 사용 장면 (라이프스타일 컷)        │
│  - 크기 비교 (손, 동전, A4 등)        │
├─────────────────────────────────────┤
│  5단계: 스펙/상세 정보                │  ← 이성적 판단 근거
│  - 소재, 크기, 무게, 용량             │
│  - 구성품 안내                        │
│  - 테이블 또는 아이콘+텍스트 형태     │
├─────────────────────────────────────┤
│  6단계: 신뢰 요소                     │  ← 의심 해소
│  - 실제 후기/리뷰 캡처               │
│  - 인증서/수상 내역                   │
│  - 누적 판매량 ("10만개 돌파")        │
│  - 언론 보도/셀럽 사용               │
├─────────────────────────────────────┤
│  7단계: 사용법/활용 팁                │  ← 구매 후 상상
│  - 사용 방법 step by step            │
│  - 활용 시나리오                      │
│  - 주의사항                          │
├─────────────────────────────────────┤
│  8단계: 배송/교환/환불 안내            │  ← 구매 장벽 제거
│  - 배송 소요일                        │
│  - 교환/환불 조건                     │
│  - 고객센터 연락처                    │
├─────────────────────────────────────┤
│  9단계: 마지막 CTA / 추가 혜택        │  ← 최종 전환 유도
│  - "지금 구매하면 OO 증정"            │
│  - 한정 수량/기간 강조               │
│  - 세트/묶음 상품 안내               │
└─────────────────────────────────────┘
```

### 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **첫 화면 승부** | 60% 이상이 첫 스크롤에서 구매 여부 결정 |
| **감정 → 논리** | 공감으로 시작 → 스펙으로 확인 → 신뢰로 마감 |
| **1가지 핵심 메시지** | 아무리 길어도 기억에 남는 건 하나 |
| **이미지 70% : 텍스트 30%** | 모바일에서 긴 텍스트는 읽히지 않음 |
| **CTA 반복 배치** | 스크롤마다 1회, 최소 2~3회 |

---

## 2. HTML 템플릿 코드 3종

### 공통 제약사항 (네이버 스마트스토어)

- 가로 사이즈: **860px** 권장
- 한 이미지 세로: **5,000px 이하**
- 최대 용량: **20MB**
- DPI: **72 또는 96** (초과 시 색상 왜곡/깨짐)
- **외부 호스팅 이미지 사용 불가** (네이버 이미지 호스팅만 가능)
- **A태그 제한** (네이버 계열 링크만 허용)
- **TABLE 태그 사용 제한**
- **외부 CSS/JS 불가** → 반드시 인라인 스타일

---

### 템플릿 A: 가성비 상품 (1~2만원대)

> 빠른 결정을 유도. 짧고 강렬하게. 가격 메리트와 후기 중심.

```html
<!-- ========== 가성비 상품 상세페이지 ========== -->
<div style="max-width:860px; margin:0 auto; font-family:'Noto Sans KR','맑은 고딕',sans-serif; color:#333; line-height:1.8;">

  <!-- 1단계: 후킹 배너 -->
  <div style="text-align:center; padding:40px 20px; background:#FFF8E1;">
    <p style="font-size:15px; color:#FF6F00; font-weight:700; margin:0 0 8px 0; letter-spacing:-0.5px;">
      지금 이 가격, 다시 없습니다
    </p>
    <p style="font-size:28px; font-weight:900; color:#222; margin:0 0 12px 0; letter-spacing:-1px; line-height:1.3;">
      하루 커피 한 잔 값으로<br>달라지는 일상
    </p>
    <p style="font-size:16px; color:#666; margin:0 0 24px 0;">
      ★★★★★ 구매자 리뷰 4.8점 | 누적 판매 12,000개
    </p>
    <!-- 대표 상품 이미지 (네이버 호스팅) -->
    <img src="대표이미지URL" alt="상품명" style="width:100%; max-width:600px; border-radius:12px;" />
  </div>

  <!-- 2단계: 공감/문제 제기 -->
  <div style="padding:40px 24px; text-align:center;">
    <p style="font-size:20px; font-weight:700; color:#333; margin:0 0 16px 0;">
      혹시 이런 고민 하고 계신가요?
    </p>
    <div style="display:inline-block; text-align:left; font-size:15px; color:#555; line-height:2.2;">
      <p style="margin:0;">😤 매번 사면 금방 망가지는 저렴한 제품</p>
      <p style="margin:0;">💸 비싼 건 부담스럽고, 싼 건 불안하고</p>
      <p style="margin:0;">🤔 후기 없는 제품이라 망설여지고</p>
    </div>
  </div>

  <!-- 3단계: 해결책 (USP) -->
  <div style="padding:40px 24px; background:#F5F5F5; text-align:center;">
    <p style="font-size:22px; font-weight:900; color:#1565C0; margin:0 0 20px 0; letter-spacing:-0.5px;">
      가격은 착하게, 품질은 확실하게
    </p>
    <!-- USP 포인트 -->
    <div style="display:inline-block; text-align:left; max-width:500px;">
      <div style="padding:16px 0; border-bottom:1px solid #E0E0E0;">
        <p style="font-size:17px; font-weight:700; color:#333; margin:0 0 4px 0;">01. 프리미엄 소재 사용</p>
        <p style="font-size:14px; color:#777; margin:0;">고가 브랜드와 동일한 원단을 사용합니다</p>
      </div>
      <div style="padding:16px 0; border-bottom:1px solid #E0E0E0;">
        <p style="font-size:17px; font-weight:700; color:#333; margin:0 0 4px 0;">02. 3중 내구성 테스트 통과</p>
        <p style="font-size:14px; color:#777; margin:0;">1,000회 이상 반복 사용 테스트 완료</p>
      </div>
      <div style="padding:16px 0;">
        <p style="font-size:17px; font-weight:700; color:#333; margin:0 0 4px 0;">03. 12,000명이 선택한 베스트셀러</p>
        <p style="font-size:14px; color:#777; margin:0;">평균 평점 4.8 / 재구매율 67%</p>
      </div>
    </div>
  </div>

  <!-- 4단계: 상품 이미지 -->
  <div style="padding:40px 0; text-align:center;">
    <img src="상품이미지1" alt="상품 상세1" style="width:100%; max-width:860px;" />
    <img src="상품이미지2" alt="상품 상세2" style="width:100%; max-width:860px; margin-top:8px;" />
  </div>

  <!-- 5단계: 스펙 -->
  <div style="padding:40px 24px; background:#FAFAFA;">
    <p style="font-size:20px; font-weight:700; text-align:center; margin:0 0 24px 0;">상품 정보</p>
    <div style="max-width:600px; margin:0 auto; font-size:14px;">
      <div style="display:flex; border-bottom:1px solid #EEE; padding:12px 0;">
        <span style="flex:0 0 120px; color:#999; font-weight:600;">소재</span>
        <span style="color:#333;">프리미엄 폴리에스터 100%</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #EEE; padding:12px 0;">
        <span style="flex:0 0 120px; color:#999; font-weight:600;">크기</span>
        <span style="color:#333;">가로 30cm x 세로 20cm x 높이 10cm</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #EEE; padding:12px 0;">
        <span style="flex:0 0 120px; color:#999; font-weight:600;">무게</span>
        <span style="color:#333;">약 350g</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #EEE; padding:12px 0;">
        <span style="flex:0 0 120px; color:#999; font-weight:600;">구성</span>
        <span style="color:#333;">본품 1개 + 파우치 1개</span>
      </div>
      <div style="display:flex; padding:12px 0;">
        <span style="flex:0 0 120px; color:#999; font-weight:600;">제조국</span>
        <span style="color:#333;">대한민국</span>
      </div>
    </div>
  </div>

  <!-- 6단계: 신뢰 요소 (리뷰) -->
  <div style="padding:40px 24px; text-align:center;">
    <p style="font-size:20px; font-weight:700; margin:0 0 8px 0;">실제 구매자 후기</p>
    <p style="font-size:14px; color:#999; margin:0 0 24px 0;">솔직한 리뷰만 모았습니다</p>
    <img src="리뷰캡처이미지" alt="구매후기" style="width:100%; max-width:600px; border-radius:8px; border:1px solid #EEE;" />
  </div>

  <!-- 7~8단계: 배송/교환 -->
  <div style="padding:40px 24px; background:#F5F5F5; font-size:14px; color:#666; line-height:2.0;">
    <p style="font-size:18px; font-weight:700; color:#333; text-align:center; margin:0 0 20px 0;">배송 및 교환/환불 안내</p>
    <div style="max-width:500px; margin:0 auto;">
      <p style="margin:0;">• 배송비: <strong style="color:#333;">무료배송</strong> (제주/도서산간 추가 3,000원)</p>
      <p style="margin:0;">• 배송기간: 결제 후 <strong style="color:#333;">1~2 영업일</strong> 이내 출고</p>
      <p style="margin:0;">• 교환/반품: 수령 후 <strong style="color:#333;">7일 이내</strong> 가능 (단순변심 포함)</p>
      <p style="margin:0;">• 고객센터: 카카오톡 @스토어명 (평일 10:00~17:00)</p>
    </div>
  </div>

  <!-- 9단계: 마지막 CTA -->
  <div style="padding:40px 24px; text-align:center; background:#1565C0;">
    <p style="font-size:22px; font-weight:900; color:#fff; margin:0 0 12px 0;">
      지금 주문하면, 내일 도착!
    </p>
    <p style="font-size:15px; color:rgba(255,255,255,0.85); margin:0;">
      오늘 자정까지 주문 시 익일 출고 | 7일 무조건 환불 보장
    </p>
  </div>

</div>
```

---

### 템플릿 B: 중가 상품 (3~8만원대)

> 품질과 가치를 느끼게. 스토리텔링 + 비교 구성.

```html
<!-- ========== 중가 상품 상세페이지 ========== -->
<div style="max-width:860px; margin:0 auto; font-family:'Noto Sans KR','맑은 고딕',sans-serif; color:#333; line-height:1.8;">

  <!-- 1단계: 후킹 배너 -->
  <div style="text-align:center; padding:48px 24px; background:linear-gradient(180deg, #F8F4F0 0%, #FFFFFF 100%);">
    <p style="font-size:13px; color:#8D6E63; font-weight:600; letter-spacing:2px; margin:0 0 12px 0;">
      BEST SELLER
    </p>
    <p style="font-size:30px; font-weight:900; color:#2E2E2E; margin:0 0 8px 0; letter-spacing:-1.5px; line-height:1.3;">
      하나면 충분합니다
    </p>
    <p style="font-size:16px; color:#888; margin:0 0 32px 0; font-weight:400;">
      3년을 써도 처음 그대로, 장인의 마감
    </p>
    <img src="대표이미지URL" alt="상품명" style="width:100%; max-width:700px;" />
  </div>

  <!-- 2단계: 브랜드 스토리 / 공감 -->
  <div style="padding:48px 24px; text-align:center;">
    <p style="font-size:14px; color:#999; margin:0 0 8px 0;">BRAND STORY</p>
    <p style="font-size:22px; font-weight:700; color:#333; margin:0 0 20px 0; line-height:1.5;">
      "저렴한 건 많았지만,<br>오래 쓸 수 있는 건 없었습니다"
    </p>
    <p style="font-size:15px; color:#666; max-width:500px; margin:0 auto; line-height:1.9;">
      3년간 50번의 시제작 끝에 완성한 제품입니다.
      소재 선택부터 마감까지, 타협 없이 만들었습니다.
      비싸서가 아니라, 오래 써서 결국 더 저렴합니다.
    </p>
  </div>

  <!-- 3단계: 핵심 USP 3가지 -->
  <div style="padding:48px 24px; background:#FAFAFA;">
    <p style="font-size:20px; font-weight:700; text-align:center; margin:0 0 32px 0;">왜 이 제품인가요?</p>

    <!-- USP 1 -->
    <div style="max-width:600px; margin:0 auto 32px auto; text-align:center;">
      <img src="USP이미지1" alt="특징1" style="width:100%; max-width:500px; border-radius:8px;" />
      <p style="font-size:18px; font-weight:700; color:#333; margin:16px 0 8px 0;">견고한 이중 스티칭</p>
      <p style="font-size:14px; color:#777; margin:0;">일반 제품 대비 3배 강한 내구성. 매일 사용해도 올 풀림 없음.</p>
    </div>

    <!-- USP 2 -->
    <div style="max-width:600px; margin:0 auto 32px auto; text-align:center;">
      <img src="USP이미지2" alt="특징2" style="width:100%; max-width:500px; border-radius:8px;" />
      <p style="font-size:18px; font-weight:700; color:#333; margin:16px 0 8px 0;">이탈리아 천연 가죽</p>
      <p style="font-size:14px; color:#777; margin:0;">시간이 지날수록 깊어지는 색감. 인조가죽과는 차원이 다릅니다.</p>
    </div>

    <!-- USP 3 -->
    <div style="max-width:600px; margin:0 auto; text-align:center;">
      <img src="USP이미지3" alt="특징3" style="width:100%; max-width:500px; border-radius:8px;" />
      <p style="font-size:18px; font-weight:700; color:#333; margin:16px 0 8px 0;">30년 경력 장인 수작업</p>
      <p style="font-size:14px; color:#777; margin:0;">기계가 대체할 수 없는 섬세한 마감. 하루 50개 한정 제작.</p>
    </div>
  </div>

  <!-- 4단계: Before/After 또는 비교 -->
  <div style="padding:48px 24px; text-align:center;">
    <p style="font-size:20px; font-weight:700; margin:0 0 24px 0;">일반 제품 vs 우리 제품</p>
    <div style="max-width:600px; margin:0 auto; font-size:14px;">
      <div style="display:flex; padding:14px 16px; background:#FFF3E0; border-radius:8px 8px 0 0; font-weight:700;">
        <span style="flex:1; text-align:center;">비교 항목</span>
        <span style="flex:1; text-align:center; color:#E65100;">일반 제품</span>
        <span style="flex:1; text-align:center; color:#1565C0;">우리 제품</span>
      </div>
      <div style="display:flex; padding:12px 16px; border-bottom:1px solid #EEE;">
        <span style="flex:1; text-align:center; color:#666;">소재</span>
        <span style="flex:1; text-align:center; color:#999;">합성 피혁</span>
        <span style="flex:1; text-align:center; color:#333; font-weight:600;">천연 가죽</span>
      </div>
      <div style="display:flex; padding:12px 16px; border-bottom:1px solid #EEE;">
        <span style="flex:1; text-align:center; color:#666;">내구성</span>
        <span style="flex:1; text-align:center; color:#999;">6개월~1년</span>
        <span style="flex:1; text-align:center; color:#333; font-weight:600;">3년 이상</span>
      </div>
      <div style="display:flex; padding:12px 16px; border-bottom:1px solid #EEE;">
        <span style="flex:1; text-align:center; color:#666;">제작 방식</span>
        <span style="flex:1; text-align:center; color:#999;">기계 대량생산</span>
        <span style="flex:1; text-align:center; color:#333; font-weight:600;">수작업 한정</span>
      </div>
      <div style="display:flex; padding:12px 16px;">
        <span style="flex:1; text-align:center; color:#666;">1년 비용</span>
        <span style="flex:1; text-align:center; color:#999;">2만원 x 2회 = 4만원</span>
        <span style="flex:1; text-align:center; color:#1565C0; font-weight:700;">5만원 x 1회 = 5만원</span>
      </div>
    </div>
  </div>

  <!-- 5단계: 상세 스펙 -->
  <div style="padding:40px 24px; background:#F5F5F5;">
    <p style="font-size:20px; font-weight:700; text-align:center; margin:0 0 24px 0;">SPECIFICATION</p>
    <div style="max-width:600px; margin:0 auto; font-size:14px;">
      <div style="display:flex; border-bottom:1px solid #DDD; padding:12px 0;">
        <span style="flex:0 0 130px; color:#999; font-weight:600;">소재</span>
        <span style="color:#333;">이탈리안 풀그레인 레더</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #DDD; padding:12px 0;">
        <span style="flex:0 0 130px; color:#999; font-weight:600;">사이즈</span>
        <span style="color:#333;">W 210 x H 110 x D 25 mm</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #DDD; padding:12px 0;">
        <span style="flex:0 0 130px; color:#999; font-weight:600;">무게</span>
        <span style="color:#333;">약 120g</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #DDD; padding:12px 0;">
        <span style="flex:0 0 130px; color:#999; font-weight:600;">컬러</span>
        <span style="color:#333;">블랙 / 브라운 / 네이비 / 버건디</span>
      </div>
      <div style="display:flex; padding:12px 0;">
        <span style="flex:0 0 130px; color:#999; font-weight:600;">구성</span>
        <span style="color:#333;">본품 + 더스트백 + 케어 카드</span>
      </div>
    </div>
  </div>

  <!-- 6단계: 리뷰/신뢰 -->
  <div style="padding:48px 24px; text-align:center;">
    <p style="font-size:20px; font-weight:700; margin:0 0 8px 0;">고객이 직접 말하는 품질</p>
    <p style="font-size:14px; color:#999; margin:0 0 24px 0;">★★★★★ 평균 4.9점 (리뷰 1,847건)</p>
    <img src="리뷰모음이미지" alt="리뷰" style="width:100%; max-width:600px; border-radius:8px;" />
  </div>

  <!-- 7단계: 사용법/관리법 -->
  <div style="padding:40px 24px; background:#F8F4F0;">
    <p style="font-size:20px; font-weight:700; text-align:center; margin:0 0 24px 0;">관리 방법</p>
    <div style="max-width:500px; margin:0 auto; font-size:14px; color:#666; line-height:2.2;">
      <p style="margin:0;"><strong style="color:#333;">STEP 1.</strong> 부드러운 천으로 먼지를 닦아주세요</p>
      <p style="margin:0;"><strong style="color:#333;">STEP 2.</strong> 전용 크림을 소량 도포해 주세요</p>
      <p style="margin:0;"><strong style="color:#333;">STEP 3.</strong> 직사광선을 피해 보관해 주세요</p>
    </div>
  </div>

  <!-- 8단계: 배송/교환 -->
  <div style="padding:40px 24px; font-size:14px; color:#888; line-height:2.0;">
    <p style="font-size:18px; font-weight:700; color:#333; text-align:center; margin:0 0 20px 0;">구매 안내</p>
    <div style="max-width:500px; margin:0 auto;">
      <p style="margin:0;">• 배송비: <strong style="color:#333;">무료배송</strong></p>
      <p style="margin:0;">• 배송: 결제 후 <strong style="color:#333;">2~3 영업일</strong> 이내 출고</p>
      <p style="margin:0;">• 교환/반품: 수령 후 <strong style="color:#333;">14일 이내</strong></p>
      <p style="margin:0;">• 상품 하자 시 <strong style="color:#333;">무상 교환</strong></p>
    </div>
  </div>

  <!-- 9단계: 마지막 CTA -->
  <div style="padding:48px 24px; text-align:center; background:#2E2E2E;">
    <p style="font-size:24px; font-weight:900; color:#fff; margin:0 0 12px 0; letter-spacing:-0.5px;">
      3년을 함께할 파트너
    </p>
    <p style="font-size:15px; color:rgba(255,255,255,0.7); margin:0 0 24px 0;">
      하루 50개 한정 제작 | 무료배송 + 14일 무조건 환불
    </p>
    <div style="display:inline-block; padding:14px 48px; background:#D4A574; color:#fff; font-size:16px; font-weight:700; border-radius:8px;">
      지금 바로 주문하기
    </div>
  </div>

</div>
```

---

### 템플릿 C: 고가 상품 (10만원 이상)

> 프리미엄 분위기. 여백 많이. 스토리 중심. 브랜드 가치 전달.

```html
<!-- ========== 고가 상품 상세페이지 ========== -->
<div style="max-width:860px; margin:0 auto; font-family:'Noto Sans KR','맑은 고딕',sans-serif; color:#222; line-height:1.8;">

  <!-- 1단계: 후킹 - 미니멀 히어로 -->
  <div style="text-align:center; padding:64px 24px; background:#0A0A0A;">
    <p style="font-size:12px; color:#999; letter-spacing:4px; margin:0 0 20px 0; font-weight:300;">
      HANDCRAFTED SINCE 2018
    </p>
    <p style="font-size:34px; font-weight:200; color:#FFFFFF; margin:0 0 16px 0; letter-spacing:-1px; line-height:1.3;">
      완벽을 위한<br>마지막 한 끗
    </p>
    <p style="font-size:15px; color:#888; margin:0 0 40px 0; font-weight:300;">
      소재부터 마감까지, 100% 수작업
    </p>
    <img src="히어로이미지URL" alt="상품명" style="width:100%; max-width:700px;" />
  </div>

  <!-- 큰 여백 -->
  <div style="height:80px; background:#fff;"></div>

  <!-- 2단계: 브랜드 철학 -->
  <div style="padding:0 24px 60px 24px; text-align:center;">
    <p style="font-size:13px; color:#BBB; letter-spacing:3px; margin:0 0 16px 0;">OUR PHILOSOPHY</p>
    <p style="font-size:24px; font-weight:300; color:#333; margin:0 0 20px 0; line-height:1.6; letter-spacing:-0.5px;">
      "좋은 물건은<br>시간이 증명합니다"
    </p>
    <p style="font-size:14px; color:#888; max-width:480px; margin:0 auto; line-height:2.0; font-weight:300;">
      2018년, 작은 공방에서 시작했습니다. 유행을 따르지 않고,
      시간이 지나도 변하지 않는 가치를 담습니다.
      한 땀 한 땀, 장인의 손에서 태어나는 제품입니다.
    </p>
  </div>

  <!-- 대형 이미지 풀폭 -->
  <img src="분위기이미지1" alt="제품 분위기" style="width:100%;" />

  <!-- 3단계: 소재 깊이 있게 -->
  <div style="padding:64px 24px; text-align:center;">
    <p style="font-size:13px; color:#BBB; letter-spacing:3px; margin:0 0 16px 0;">MATERIAL</p>
    <p style="font-size:22px; font-weight:300; color:#222; margin:0 0 24px 0; line-height:1.5;">
      토스카나 지방의 소가죽,<br>6개월 자연 건조
    </p>
    <img src="소재이미지" alt="소재 상세" style="width:100%; max-width:600px; margin:0 auto 24px auto;" />
    <p style="font-size:14px; color:#888; max-width:480px; margin:0 auto; line-height:2.0;">
      화학 처리 없이 식물성 타닌으로만 무두질한 가죽입니다.
      처음에는 딱딱하지만 사용할수록 손에 익어
      세상에 하나뿐인 나만의 결이 만들어집니다.
    </p>
  </div>

  <!-- 디테일 이미지 그룹 -->
  <div style="padding:0;">
    <img src="디테일1" alt="디테일 컷" style="width:100%;" />
    <div style="height:4px; background:#fff;"></div>
    <img src="디테일2" alt="디테일 컷" style="width:100%;" />
  </div>

  <!-- 4단계: 장인 소개 -->
  <div style="padding:64px 24px; background:#F8F6F3; text-align:center;">
    <p style="font-size:13px; color:#BBB; letter-spacing:3px; margin:0 0 16px 0;">CRAFTSMAN</p>
    <p style="font-size:22px; font-weight:300; color:#222; margin:0 0 24px 0; line-height:1.5;">
      35년 경력, 김OO 장인
    </p>
    <img src="장인사진" alt="장인" style="width:100%; max-width:400px; border-radius:50%; margin:0 auto 24px auto;" />
    <p style="font-size:14px; color:#888; max-width:480px; margin:0 auto; line-height:2.0; font-style:italic;">
      "하나를 만들더라도 제대로 만들고 싶습니다.
      기계로 100개 만드는 시간에 손으로 3개를 만듭니다.
      그래서 더 특별합니다."
    </p>
  </div>

  <!-- 5단계: 스펙 (미니멀) -->
  <div style="padding:64px 24px;">
    <p style="font-size:13px; color:#BBB; letter-spacing:3px; text-align:center; margin:0 0 32px 0;">DETAILS</p>
    <div style="max-width:500px; margin:0 auto; font-size:14px; font-weight:300;">
      <div style="display:flex; border-bottom:1px solid #F0F0F0; padding:16px 0;">
        <span style="flex:0 0 140px; color:#AAA;">MATERIAL</span>
        <span style="color:#444;">이탈리안 베지터블 레더</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #F0F0F0; padding:16px 0;">
        <span style="flex:0 0 140px; color:#AAA;">DIMENSION</span>
        <span style="color:#444;">W 300 x H 220 x D 60 mm</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #F0F0F0; padding:16px 0;">
        <span style="flex:0 0 140px; color:#AAA;">WEIGHT</span>
        <span style="color:#444;">약 450g</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #F0F0F0; padding:16px 0;">
        <span style="flex:0 0 140px; color:#AAA;">COLOR</span>
        <span style="color:#444;">Cognac / Espresso / Midnight</span>
      </div>
      <div style="display:flex; border-bottom:1px solid #F0F0F0; padding:16px 0;">
        <span style="flex:0 0 140px; color:#AAA;">PACKAGE</span>
        <span style="color:#444;">전용 박스 + 더스트백 + 케어키트</span>
      </div>
      <div style="display:flex; padding:16px 0;">
        <span style="flex:0 0 140px; color:#AAA;">WARRANTY</span>
        <span style="color:#444;">1년 무상 A/S</span>
      </div>
    </div>
  </div>

  <!-- 6단계: 리뷰 -->
  <div style="padding:48px 24px; background:#FAFAFA; text-align:center;">
    <p style="font-size:13px; color:#BBB; letter-spacing:3px; margin:0 0 16px 0;">REVIEWS</p>
    <p style="font-size:22px; font-weight:300; color:#222; margin:0 0 8px 0;">
      ★★★★★ 4.9
    </p>
    <p style="font-size:13px; color:#AAA; margin:0 0 32px 0;">526건의 리뷰</p>
    <img src="리뷰이미지" alt="리뷰" style="width:100%; max-width:600px; border-radius:8px;" />
  </div>

  <!-- 7단계: 패키징 -->
  <div style="padding:64px 24px; text-align:center;">
    <p style="font-size:13px; color:#BBB; letter-spacing:3px; margin:0 0 16px 0;">PACKAGING</p>
    <p style="font-size:20px; font-weight:300; color:#333; margin:0 0 24px 0;">
      선물하기에도 완벽한 패키지
    </p>
    <img src="패키징이미지" alt="패키징" style="width:100%; max-width:600px;" />
  </div>

  <!-- 8단계: 구매 안내 -->
  <div style="padding:40px 24px; font-size:13px; color:#AAA; line-height:2.2; font-weight:300;">
    <div style="max-width:500px; margin:0 auto;">
      <p style="font-size:14px; font-weight:600; color:#666; margin:0 0 12px 0;">SHIPPING & RETURN</p>
      <p style="margin:0;">• 전 상품 무료배송</p>
      <p style="margin:0;">• 주문 후 3~5 영업일 이내 수작업 제작 후 출고</p>
      <p style="margin:0;">• 수령 후 14일 이내 교환/반품 가능</p>
      <p style="margin:0;">• 1년 무상 A/S (실밥, 금속 부속 등)</p>
      <p style="margin:0;">• 각인 서비스 주문 시 교환/반품 불가</p>
    </div>
  </div>

  <!-- 9단계: 마지막 CTA -->
  <div style="padding:64px 24px; text-align:center; background:#0A0A0A;">
    <p style="font-size:26px; font-weight:200; color:#fff; margin:0 0 12px 0; letter-spacing:-0.5px;">
      오래도록 함께할 가치
    </p>
    <p style="font-size:14px; color:#666; margin:0 0 32px 0;">
      하루 3개 한정 제작 | 1년 무상 A/S | 14일 무조건 환불
    </p>
    <div style="display:inline-block; padding:16px 56px; border:1px solid #666; color:#fff; font-size:14px; font-weight:300; letter-spacing:2px;">
      ORDER NOW
    </div>
  </div>

</div>
```

---

## 3. 카피라이팅 문구 모음 (40개)

### A. 후킹 헤드카피 (첫 화면용)

| # | 유형 | 문구 예시 |
|---|------|----------|
| 1 | 가격 메리트 | "하루 커피 한 잔 값으로 달라지는 일상" |
| 2 | 가격 메리트 | "이 품질에 이 가격, 오늘이 마지막입니다" |
| 3 | 가격 메리트 | "단돈 9,900원으로 시작하는 변화" |
| 4 | 수치 신뢰 | "52,000명이 선택한 이유, 직접 확인하세요" |
| 5 | 수치 신뢰 | "재구매율 73%. 숫자가 증명합니다" |
| 6 | 수치 신뢰 | "리뷰 4.9점, 거짓말 같은 만족도" |
| 7 | 문제 해결 | "그 고민, 이걸로 끝납니다" |
| 8 | 문제 해결 | "매번 실패했다면, 방법이 틀렸던 겁니다" |
| 9 | 문제 해결 | "비싼 게 답이 아닙니다. 맞는 게 답입니다" |
| 10 | 호기심 | "열어보는 순간 '이거다' 하실 겁니다" |
| 11 | 호기심 | "왜 이걸 이제야 알았을까요?" |
| 12 | 시간 한정 | "지금 이 가격, 다시 없습니다" |

### B. 서브카피 (보조 설명)

| # | 유형 | 문구 예시 |
|---|------|----------|
| 13 | 품질 강조 | "3년을 써도 처음 그대로" |
| 14 | 품질 강조 | "소재부터 마감까지, 타협 없이" |
| 15 | 간편함 | "꺼내서 바로 사용. 설명서 필요 없습니다" |
| 16 | 간편함 | "30초 만에 설치 완료" |
| 17 | 안심 구매 | "7일 무조건 환불. 써보고 결정하세요" |
| 18 | 안심 구매 | "마음에 안 들면 100% 환불해 드립니다" |
| 19 | 배송 | "지금 주문하면, 내일 도착" |
| 20 | 배송 | "오늘 자정까지 주문 시 익일 출고" |

### C. 불릿 포인트 (특징 나열용)

| # | 유형 | 문구 예시 |
|---|------|----------|
| 21 | 소재 | "프리미엄 원단 사용 - 고가 브랜드와 동일 소재" |
| 22 | 내구성 | "1,000회 반복 테스트 통과 - 매일 써도 문제없음" |
| 23 | 인증 | "KC인증 완료 - 안전성 검증 제품" |
| 24 | 친환경 | "100% 재활용 가능 소재 - 환경까지 생각했습니다" |
| 25 | 편의성 | "원터치 개폐 - 한 손으로도 OK" |
| 26 | 다용도 | "집에서, 사무실에서, 여행에서 - 어디서든" |
| 27 | 위생 | "항균 코팅 처리 - 세균 번식 99.9% 차단" |
| 28 | 무게 | "단 150g - 들고 있는지도 모를 가벼움" |

### D. 공감/문제 제기

| # | 유형 | 문구 예시 |
|---|------|----------|
| 29 | 실패 경험 | "저렴해서 샀다가 한 달 만에 버린 적 있으시죠?" |
| 30 | 불편 | "매번 세탁할 때마다 줄어드는 옷, 이젠 그만" |
| 31 | 비교 | "비슷해 보여도 써보면 다릅니다" |
| 32 | 고민 | "뭘 사야 할지 모르겠다면, 여기서 끝내세요" |
| 33 | 시간 낭비 | "검색만 하다 지치셨죠? 답은 여기 있습니다" |

### E. 신뢰/사회적 증거

| # | 유형 | 문구 예시 |
|---|------|----------|
| 34 | 누적 판매 | "출시 6개월 만에 누적 판매 50,000개 돌파" |
| 35 | 리뷰 | "실구매자 리뷰 4.8점 - 솔직한 후기만 모았습니다" |
| 36 | 재구매 | "한 번 사면 또 삽니다. 재구매율 67%" |
| 37 | 수상 | "2025 소비자 만족 대상 수상" |

### F. 마지막 전환 유도 (CTA 근처)

| # | 유형 | 문구 예시 |
|---|------|----------|
| 38 | 긴급성 | "한정 수량 300개 - 재입고 미정" |
| 39 | 혜택 | "지금 구매 시 전용 파우치 무료 증정" |
| 40 | 보장 | "써보고 아니면 돌려주세요. 왕복 배송비 저희 부담" |

### 가격 표현 심리학 팁

| 기법 | 예시 | 효과 |
|------|------|------|
| **앵커링** | ~~59,000원~~ → **39,900원** | 할인폭을 크게 느끼게 |
| **일상 비교** | "하루 330원, 커피 한 잔 값" | 부담감 경감 |
| **단위 쪼개기** | "월 9,900원으로 매일 사용" | 총액 부담 분산 |
| **묶음 할인** | "1개 19,900원 / 2개 29,900원" | 추가 구매 유도 |
| **무료 배송 강조** | "배송비 걱정 NO! 전 상품 무료배송" | 숨겨진 비용 불안 해소 |

---

## 4. 색상/폰트/레이아웃 가이드

### 색상 팔레트

| 용도 | 색상 코드 | 설명 |
|------|-----------|------|
| **CTA / 강조** | `#FF6B35` 또는 `#E53935` | 주황~빨강 계열. 긴급성, 행동 유도 |
| **신뢰 / 정보** | `#1565C0` 또는 `#1976D2` | 파랑 계열. 신뢰, 안정감 |
| **프리미엄** | `#2E2E2E` 또는 `#0A0A0A` | 짙은 검정. 고급스러움 |
| **서브 강조** | `#FFF8E1` 또는 `#FFF3E0` | 밝은 노랑/주황 배경. 혜택 강조 |
| **본문 텍스트** | `#333333` | 가독성 최우선 |
| **보조 텍스트** | `#888888` ~ `#999999` | 부연설명, 캡션 |
| **구분선** | `#EEEEEE` ~ `#F0F0F0` | 섹션 분리 |
| **배경 (교대)** | `#FFFFFF` / `#F5F5F5` / `#FAFAFA` | 흰색과 밝은 회색 교대 |

### 폰트 가이드 (모바일 기준)

| 용도 | 크기 | 굵기 | 비고 |
|------|------|------|------|
| **메인 헤드카피** | 26~34px | 900 (Black) | 한 줄 또는 두 줄 |
| **섹션 제목** | 20~24px | 700 (Bold) | 각 섹션 시작 |
| **서브 카피** | 16~18px | 700 (Bold) | USP 요약 |
| **본문 텍스트** | 14~16px | 400 (Regular) | 설명문 |
| **보조 텍스트** | 12~14px | 400 (Regular) | 캡션, 안내 |
| **작은 레이블** | 12~13px | 600 (Semi-Bold) | 카테고리 태그 |

> PC에서 적당해 보이는 크기는 모바일에서 너무 작음. **모바일 기준으로 1.5배 크게** 작성.

### 폰트 패밀리

```
font-family: 'Noto Sans KR', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
```

### 레이아웃 원칙

| 원칙 | 설명 |
|------|------|
| **단일 컬럼** | 860px 폭에서 1열 레이아웃. 2열은 모바일에서 깨짐 |
| **섹션 간 여백** | 40~64px. 여백이 충분해야 각 섹션이 구분됨 |
| **좌우 패딩** | 최소 20~24px. 모바일에서 화면 가장자리 붙으면 답답 |
| **이미지 풀폭** | 핵심 제품 사진은 가로 860px 풀폭 사용 |
| **텍스트 중앙정렬** | 모바일에서는 중앙정렬이 시선 흐름에 자연스러움 |
| **배경색 교대** | 흰색→회색→흰색 교대로 시각적 구분 |
| **line-height** | 1.8~2.0. 모바일에서 줄 간격 넓어야 가독성 확보 |

### 이미지 사양

| 항목 | 권장값 |
|------|--------|
| 가로 해상도 | **860px** (네이버 권장) |
| 세로 (한 장당) | **1,000~1,200px** (스크롤 1회 분량) |
| 세로 최대 | 5,000px 이하 |
| 파일 형식 | JPG (사진) / PNG (텍스트 포함 이미지) |
| DPI | **72 또는 96** (초과 시 색상 왜곡) |
| 전체 용량 | 20MB 이하 |
| 최적 파일 크기 | 이미지 한 장당 200~500KB |

---

## 5. 체크리스트 (발행 전 확인사항)

### 기본 요소

- [ ] 상품명에 핵심 키워드 4~8개 포함
- [ ] 카테고리가 검색 키워드와 일치
- [ ] 브랜드/제조사 정보 정확히 매칭
- [ ] 대표 이미지(썸네일) 고화질 + 핵심 소구점 포함

### 상세페이지 구조

- [ ] 첫 화면에 USP + 대표 이미지 + 프로모션 혜택 포함
- [ ] 9단계 구성 순서 (후킹→공감→USP→이미지→스펙→신뢰→사용법→배송→CTA)
- [ ] CTA 2~3회 반복 배치
- [ ] 이미지와 텍스트 비율 7:3

### 모바일 최적화

- [ ] 가로 860px 기준 제작
- [ ] 모바일에서 폰트 크기 확인 (최소 14px)
- [ ] 모바일에서 이미지 깨짐 없는지 확인
- [ ] 스크롤 속도 적절한지 확인 (총 용량 20MB 이하)
- [ ] 실제 스마트폰에서 최종 확인

### 카피라이팅

- [ ] 헤드카피 15자 이내
- [ ] 서브카피 30자 이내
- [ ] 불릿포인트로 특징 정리 (3~5개)
- [ ] 하나의 핵심 메시지가 일관되게 전달되는지

### SEO

- [ ] 상품명에 중복 단어 없음
- [ ] 상품과 무관한 키워드 제외
- [ ] 할인 정보는 상품명이 아닌 상세설명에
- [ ] 속성/태그 정확히 입력

### 금지사항 확인

- [ ] 과대광고 표현 없음 ("최고", "최초", "유일" 등 객관적 근거 없이 사용 금지)
- [ ] 의료기기/건강식품 효능 효과 과장 표현 없음
- [ ] "치료", "완치", "예방" 등 의약품 오인 표현 없음
- [ ] 외부 호스팅 이미지 사용 안 함
- [ ] 외부 링크(A태그) 없음 (네이버 계열만 허용)
- [ ] TABLE 태그 사용 안 함 (div+flex로 대체)
- [ ] 타 브랜드 비방/직접 비교 없음
- [ ] 저작권 침해 이미지 없음
- [ ] 허위 리뷰/조작된 수치 없음

### 신뢰 요소

- [ ] 실제 구매자 리뷰 포함
- [ ] 인증서/시험성적서 해당 시 포함
- [ ] 배송/교환/환불 정보 명시
- [ ] 고객센터 연락처 기재

---

## 6. 모바일 최적화 팁

### 핵심: 80%가 모바일

스마트스토어 방문자의 약 80%가 모바일이므로, **PC가 아닌 모바일 기준으로 먼저 설계**해야 한다.

### 모바일 최적화 실전 팁

| # | 항목 | 팁 |
|---|------|-----|
| 1 | **이미지 텍스트 크기** | 이미지 안의 텍스트는 모바일에서 축소되므로, PC보다 **1.5배 크게** 넣기 |
| 2 | **단일 컬럼** | 2~3열 레이아웃은 모바일에서 깨짐. 반드시 1열 |
| 3 | **손가락 탭 영역** | CTA 버튼은 최소 44px 높이 (터치 타겟) |
| 4 | **이미지 용량** | 한 장당 200~500KB. 총 20MB 이하. 무겁면 로딩 느려서 이탈 |
| 5 | **스크롤 길이** | 전체 5~8 스크롤 이내. 너무 길면 끝까지 안 봄 |
| 6 | **핵심 먼저** | 첫 1~2 스크롤에 USP + 대표 이미지 + 혜택 모두 배치 |
| 7 | **줄 간격** | line-height 1.8~2.0. 빽빽하면 읽기 싫어함 |
| 8 | **여백** | 섹션 사이 40~64px 여백. 답답하지 않게 |
| 9 | **폰트** | 본문 최소 14px, 헤드카피 26px 이상 |
| 10 | **색 대비** | 흰 배경에 #333 텍스트 (순검정 #000은 눈 피로) |
| 11 | **이미지 alt 태그** | SEO + 접근성. 빠뜨리지 말기 |
| 12 | **테스트** | 반드시 아이폰 + 안드로이드 실기기에서 최종 확인 |

### 스마트스토어 모바일 주의사항

- 모바일에서 HTML 상세페이지가 "원본보기"로 나오는 경우:
  - 외부 호스팅 이미지를 사용하면 모바일에서 미리보기/원본보기 전환됨
  - A태그, TABLE 태그 사용 시 모바일 렌더링 문제 발생 가능
  - **네이버 이미지 호스팅 + div+flex 레이아웃**으로 해결

### 심리학 기반 전환 최적화

| 원리 | 적용 방법 |
|------|----------|
| **앵커링 효과** | 정가를 먼저 크게 → 할인가를 빨간색으로 |
| **사회적 증거** | "12,000명이 구매했습니다" 상단 배치 |
| **희소성** | "한정 수량 300개" / "오늘 자정까지" |
| **손실 회피** | "지금 안 사면 다시 이 가격 없습니다" |
| **단순 노출 효과** | 핵심 메시지를 상단/중단/하단 3회 반복 |
| **선택 과부하 방지** | 옵션은 3~5개 이내로 제한 |
| **무료의 힘** | "무료배송" 문구를 크게, 눈에 띄게 |

---

## 참고 소스

- [스마트스토어 상세페이지 사이즈 가이드 - 미리캔버스](https://help.miricanvas.com/hc/ko/articles/360041165111)
- [상세페이지 템플릿 - Adobe](https://www.adobe.com/kr/creativecloud/photography/hub/guides/design-naver-smart-store-detailed-page.html)
- [작은 브랜드 상세페이지 9단계 구조 - 브런치](https://brunch.co.kr/@designmydesign/4)
- [구매전환율 높이는 12가지 노하우 - 아이보스](https://www.i-boss.co.kr/ab-6141-52122)
- [잘 팔리는 네이버 스마트스토어 상세페이지 - 키위스냅](https://home.kiwisnap.net/post/jal-palrineun-neibeo-seumateuseutoeo-sangsepeiji-mandeulgi)
- [구매전환율 카피라이팅 구조 - skillagit](https://www.skillagit.com/people/people_view.php?b_id=008&idx=568)
- [심리학 카피라이팅 7가지 법칙 - 마중](https://www.marketing-center.co.kr/pr/psychological-copywriting.html)
- [쇼핑몰 구매전환율 - 토스비즈니스](https://blog.tossbusiness.com/articles/semo-133)
- [PDP in Ecommerce Guide - Shopify](https://www.shopify.com/blog/what-is-pdp-in-ecommerce)
- [PDP Optimization - OptiMonk](https://www.optimonk.com/boost-product-detail-pages/)
- [Product Page Best Practices - MobiLoud](https://www.mobiloud.com/blog/ecommerce-product-detail-page-best-practices)
- [네이버 쇼핑 SEO - 어센트코리아](https://www.ascentkorea.com/naver-smartstore-optimization-naverseo/)
- [상세페이지 필수 구성 5가지 - 크몽](https://kmong.com/article/881)
- [모바일 최적화 이벤트 디자인 - 리디](https://www.ridicorp.com/blog/2017/01/15/mobile-event/)
- [상세페이지 카피라이팅 심리학 10가지 - MDM디자인](https://mdmdesignstore.com/column/?bmode=view&idx=138534399)
- [상세페이지 이미지 권장 크기 - 아임웹](https://imweb.me/faq?mode=view&category=29&category2=33&idx=71710)
- [잘 팔리는 광고 카피 - 토스페이먼츠](https://www.tosspayments.com/blog/articles/semo-110)
- [Product Description Copywriting - Shopify](https://www.shopify.com/blog/8211159-9-simple-ways-to-write-product-descriptions-that-sell)
- [Product Page Optimization - Shopify](https://www.shopify.com/blog/expert-advice-improve-product-pages)
- [스마트스토어 SEO 7단계 - ampm](https://inside.ampm.co.kr/ae-kimyongmin/insight/760)
