"""
자동 번역 어댑터 — 외국인 직원 신고 텍스트 한국어 변환
옵션 A: Google Translate API (건당 ~$0.00002, 월 수백 건 거의 무료)
옵션 B: DeepL API (고품질, 월 50만자 무료)
옵션 C: 버튼 선택형이므로 "HELP_OTHER" 시만 실제 번역 필요
"""
import logging
from enum import Enum

import httpx

logger = logging.getLogger(__name__)

# 버튼 선택형 이슈 — 번역 불필요 (미리 정의된 한국어 사용)
ISSUE_TYPE_KO = {
    "CROP_ABNORMAL":   "나물 이상",
    "MACHINE_FAILURE": "기계 고장",
    "WATER_ISSUE":     "물/양액 이상",
    "TEMPERATURE":     "온도 이상",
    "ELECTRICAL":      "전기 이상",
    "HELP_OTHER":      "기타/도움 요청",
}


class TranslationAdapter:
    """
    외국인 직원 텍스트 → 한국어 자동 번역.
    이슈 유형이 버튼 선택이면 번역 API 호출 없이 처리.
    자유 입력(HELP_OTHER)일 때만 Google Translate 호출.
    """

    def __init__(self, google_api_key: str = ""):
        self.google_api_key = google_api_key

    def get_issue_ko(self, issue_type: str) -> str:
        """버튼 선택 이슈 타입 → 한국어 변환 (API 호출 없음)"""
        return ISSUE_TYPE_KO.get(issue_type, issue_type)

    async def translate_to_ko(self, text: str, source_lang: str) -> str:
        """
        텍스트를 한국어로 번역.
        source_lang이 'ko'이거나 텍스트가 없으면 원문 그대로 반환.
        """
        if not text or source_lang.lower() == "ko":
            return text

        if not self.google_api_key:
            # API 키 미설정 시: 번역 없이 원문 + 언어 표시
            return f"[{source_lang.upper()}] {text}"

        try:
            return await self._call_google_translate(text, source_lang, "ko")
        except Exception as e:
            logger.error(f"[Translation] 번역 실패: {e}")
            return f"[번역 실패 — 원문] {text}"

    async def _call_google_translate(self, text: str,
                                      source: str, target: str) -> str:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                "https://translation.googleapis.com/language/translate/v2",
                params={"key": self.google_api_key},
                json={
                    "q": text,
                    "source": source,
                    "target": target,
                    "format": "text",
                },
            )
        data = resp.json()
        return data["data"]["translations"][0]["translatedText"]
