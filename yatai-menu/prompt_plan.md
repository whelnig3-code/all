# 야타이 사진 메뉴판 구현 계획 (V7 - Digital Menu)

## 확정일: 2026-03-07

## 완료된 Phase

### Phase 1~4 (V6): 인쇄용 메뉴판 - DONE
- print-v6-landscape-2p.html (가로 2페이지)
- print-v6-portrait-1p.html (세로 1페이지)
- menu.json 데이터 수정 완료
- 사진 5개 BEST 메뉴 적용

### Phase 5: 태블릿 사진 메뉴판 - DONE
- index.html 전면 리뉴얼 (인쇄 -> 디지털 메뉴판)
- 다크 테마, 사진 그리드 레이아웃
- 3열(가로)/2열(세로)/1열(모바일) 반응형
- 카테고리 탭 네비게이션
- 8개 언어 전환 (i18n.js)
- 추천(BEST) 뱃지 표시
- 점심특선 배너
- 원산지/리뷰 이벤트 푸터

### Phase 6: 핸드폰 사진 메뉴판 - DONE
- mobile.html 리뉴얼
- 사진 카드형 리스트 (90x90 썸네일)
- 동일한 다국어/카테고리 기능
- lazy loading 적용

### Phase 7: PWA 설치 - DONE
- manifest.json (앱 이름, 아이콘, 테마)
- sw.js (Service Worker, 오프라인 캐싱)
- 아이콘 192/512px 생성
- 태블릿에서 "홈 화면에 추가" -> 전체화면 앱

## 대기 중

### Phase 8: 메뉴 사진 촬영 및 적용
- 98개 메뉴 중 0개 실사진 (전부 placeholder)
- `python _prepare_images.py` 로 미확보 리스트 확인
- 사진 촬영 후 images/ 폴더에 `<item-id>.jpg` 저장
- `python _prepare_images.py optimize` 로 WebP 변환 (600x400, max 80KB)
- menu.json의 image 필드를 `images/<item-id>.webp`로 업데이트

### Phase 9: 다국어 검증
- 8개 언어별 UI/메뉴명/카테고리 확인
- 번역 품질 이슈 수정

## 이전 계획

### V6 계획 (2026-03-06)
- Phase 1: 사진 파일 준비 - DONE
- Phase 2: menu.json 데이터 수정 - DONE
- Phase 3: 가로 2페이지 HTML - DONE
- Phase 4: 세로 1페이지 HTML - DONE

## 파일 구성

| 파일 | 용도 |
|------|------|
| index.html | 태블릿 디지털 메뉴판 (사진 그리드) |
| mobile.html | 핸드폰 디지털 메뉴판 (사진 리스트) |
| manifest.json | PWA 매니페스트 |
| sw.js | Service Worker (오프라인/캐싱) |
| _prepare_images.py | 사진 준비/최적화 도구 |
| print-v6-landscape-2p.html | 인쇄용 가로 2페이지 |
| print-v6-portrait-1p.html | 인쇄용 세로 1페이지 |
