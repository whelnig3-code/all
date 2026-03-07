"""
카카오 챗봇 어댑터 — 카카오 i 오픈빌더 Webhook 처리
재우(주) 비즈니스 채널에 연결된 챗봇 (외국인 긴급신고용)
"""
import logging
from dataclasses import dataclass

from domain.chatbot.models import EmergencyReport, IssueType, ReportStatus
from infrastructure.adapters.translation_adapter import TranslationAdapter

logger = logging.getLogger(__name__)


# ── 챗봇 응답 빌더 ──────────────────────────────────────────────────

class KakaoChatbotResponseBuilder:
    """카카오 i 오픈빌더 응답 JSON 생성"""

    @staticmethod
    def simple_text(text: str) -> dict:
        return {"version": "2.0", "template": {"outputs": [{"simpleText": {"text": text}}]}}

    @staticmethod
    def issue_type_selector(lang: str = "vi") -> dict:
        """문제 유형 선택 버튼 (Step 2)"""
        labels = {
            "ko": {"CROP": "🥬 나물 이상",    "MACHINE": "⚙️ 기계 고장",
                   "WATER": "💧 물/양액",      "TEMP":    "🌡️ 온도",
                   "ELEC": "⚡ 전기",           "OTHER":   "🆘 기타/도움"},
            "vi": {"CROP": "🥬 Rau bất thường","MACHINE": "⚙️ Máy hỏng",
                   "WATER": "💧 Nước/dịch",    "TEMP":    "🌡️ Nhiệt độ",
                   "ELEC": "⚡ Điện",           "OTHER":   "🆘 Khác/Cứu"},
            "en": {"CROP": "🥬 Crop Issue",    "MACHINE": "⚙️ Machine Fail",
                   "WATER": "💧 Water",         "TEMP":    "🌡️ Temperature",
                   "ELEC": "⚡ Electrical",     "OTHER":   "🆘 Help/Other"},
        }
        lmap = labels.get(lang, labels["vi"])
        question = {"ko": "무슨 문제인가요?", "vi": "Vấn đề gì vậy?",
                    "en": "What is the problem?"}.get(lang, "Vấn đề gì?")

        return {
            "version": "2.0",
            "template": {
                "outputs": [{"simpleText": {"text": question}}],
                "quickReplies": [
                    {"label": lmap["CROP"],    "action": "block", "blockId": "ISSUE_CROP"},
                    {"label": lmap["MACHINE"], "action": "block", "blockId": "ISSUE_MACHINE"},
                    {"label": lmap["WATER"],   "action": "block", "blockId": "ISSUE_WATER"},
                    {"label": lmap["TEMP"],    "action": "block", "blockId": "ISSUE_TEMP"},
                    {"label": lmap["ELEC"],    "action": "block", "blockId": "ISSUE_ELEC"},
                    {"label": lmap["OTHER"],   "action": "block", "blockId": "ISSUE_OTHER"},
                ],
            },
        }

    @staticmethod
    def zone_selector(lang: str = "vi") -> dict:
        """구역 선택 버튼 (Step 3)"""
        question = {"ko": "어느 구역?", "vi": "Khu vực nào?",
                    "en": "Which zone?"}.get(lang, "Khu vực?")
        return {
            "version": "2.0",
            "template": {
                "outputs": [{"simpleText": {"text": question}}],
                "quickReplies": [
                    {"label": "A동", "action": "block", "blockId": "ZONE_A"},
                    {"label": "B동", "action": "block", "blockId": "ZONE_B"},
                    {"label": "C동", "action": "block", "blockId": "ZONE_C"},
                    {"label": {"ko": "전체", "vi": "Tất cả", "en": "All"}.get(lang, "전체"),
                     "action": "block", "blockId": "ZONE_ALL"},
                ],
            },
        }

    @staticmethod
    def ack_response(report_id: str, lang: str = "vi") -> dict:
        """신고 접수 완료 응답"""
        messages = {
            "ko": f"접수되었습니다. (#{report_id[:8]})\n담당자가 곧 확인합니다.",
            "vi": f"Đã nhận! (#{report_id[:8]})\nNgười phụ trách sẽ xử lý ngay.",
            "en": f"Received! (#{report_id[:8]})\nSupervisor will respond soon.",
        }
        return KakaoChatbotResponseBuilder.simple_text(
            messages.get(lang, messages["vi"])
        )


# ── 챗봇 이벤트 핸들러 ───────────────────────────────────────────────

class KakaoChatbotHandler:
    """
    카카오 챗봇 Webhook 이벤트 처리.
    FastAPI 라우터에서 호출됩니다.
    """

    def __init__(
        self,
        translation_adapter: TranslationAdapter,
        task_use_case=None,
        notification_use_case=None,
        report_store: dict | None = None,   # Phase 1: 인메모리, Phase 2: DB
    ):
        self.translator = translation_adapter
        self.task_uc = task_use_case
        self.notif_uc = notification_use_case
        self._reports: dict[str, EmergencyReport] = report_store if report_store is not None else {}
        self._builder = KakaoChatbotResponseBuilder()

    async def handle_webhook(self, body: dict) -> dict:
        """
        카카오 i 오픈빌더 Webhook 진입점.
        body: 오픈빌더 요청 JSON
        """
        user_key  = body.get("userRequest", {}).get("user", {}).get("id", "")
        block_id  = body.get("userRequest", {}).get("block", {}).get("id", "")
        utterance = body.get("userRequest", {}).get("utterance", "")
        lang      = self._detect_lang(body)

        logger.info(f"[Chatbot] block_id={block_id}, user={user_key[:8]}")

        # ── 시작 화면 ──
        if block_id in ("WELCOME", "START_REPORT"):
            return self._builder.issue_type_selector(lang)

        # ── 이슈 유형 선택 ──
        issue_map = {
            "ISSUE_CROP":    IssueType.CROP_ABNORMAL,
            "ISSUE_MACHINE": IssueType.MACHINE_FAILURE,
            "ISSUE_WATER":   IssueType.WATER_ISSUE,
            "ISSUE_TEMP":    IssueType.TEMPERATURE,
            "ISSUE_ELEC":    IssueType.ELECTRICAL,
            "ISSUE_OTHER":   IssueType.HELP_OTHER,
        }
        if block_id in issue_map:
            # 세션에 이슈 타입 저장 (Phase 1: 인메모리)
            self._reports[user_key] = EmergencyReport(
                kakao_user_key=user_key,
                reporter_lang=lang,
                issue_type=issue_map[block_id],
            )
            return self._builder.zone_selector(lang)

        # ── 구역 선택 ──
        zone_map = {
            "ZONE_A": "A동", "ZONE_B": "B동",
            "ZONE_C": "C동", "ZONE_ALL": "전체",
        }
        if block_id in zone_map and user_key in self._reports:
            report = self._reports[user_key]
            report.location_zone = zone_map[block_id]
            # 사진 요청으로 이동
            photo_msg = {"ko": "📸 사진을 찍어서 보내주세요 (선택사항)",
                         "vi": "📸 Gửi ảnh (không bắt buộc)",
                         "en": "📸 Send a photo (optional)"}.get(lang, "📸")
            return {
                "version": "2.0",
                "template": {
                    "outputs": [{"simpleText": {"text": photo_msg}}],
                    "quickReplies": [
                        {"label": {"ko": "건너뛰기", "vi": "Bỏ qua",
                                   "en": "Skip"}.get(lang, "Skip"),
                         "action": "block", "blockId": "SUBMIT_NO_PHOTO"},
                    ],
                },
            }

        # ── 이미지 수신 ──
        attachments = body.get("action", {}).get("clientExtra", {})
        if "imageUrl" in attachments and user_key in self._reports:
            from domain.chatbot.models import EmergencyReportPhoto
            report = self._reports[user_key]
            photo = EmergencyReportPhoto(
                report_id=report.report_id,
                kakao_image_url=attachments["imageUrl"],
            )
            report.photos.append(photo)

        # ── 최종 제출 ──
        if block_id in ("SUBMIT_NO_PHOTO", "SUBMIT_WITH_PHOTO") or "imageUrl" in attachments:
            if user_key in self._reports:
                report = self._reports[user_key]
                await self._finalize_report(report, utterance)
                del self._reports[user_key]
                return self._builder.ack_response(report.report_id, lang)

        # 기본 응답
        return self._builder.issue_type_selector(lang)

    async def _finalize_report(self, report: EmergencyReport, utterance: str) -> None:
        """신고 최종 처리: 번역 + Task 생성 + 관리자 알림"""
        # 1. 자동 번역
        if report.issue_type == IssueType.HELP_OTHER and utterance:
            report.description_raw = utterance
            report.description_ko = await self.translator.translate_to_ko(
                utterance, report.reporter_lang
            )
        else:
            report.description_ko = self.translator.get_issue_ko(report.issue_type.value)

        # 2. EMERGENCY Task 자동 생성
        if self.task_uc:
            title = f"[긴급신고] {report.description_ko}"
            if report.location_zone:
                title += f" — {report.location_zone}"
            task = await self.task_uc.create_task(
                title=title,
                task_type="EMERGENCY",
                assignee_id=report.reporter_id or "UNASSIGNED",
                team_id="DEFAULT",
                created_by="CHATBOT",
                is_urgent=True,
            )
            report.linked_task_id = task.task_id

        # 3. 관리자 단톡방 GROUP 알림
        if self.notif_uc:
            from domain.ports.notification_port import (
                ConversationType, MessagePayload,
            )
            photo_info = f"\n■ 사진: {len(report.photos)}장 첨부" if report.photos else ""
            payload = MessagePayload(
                recipient_id="ADMIN",
                conversation_type=ConversationType.GROUP,
                group_conversation_id=None,
                template_key="emergency_started",
                language="KO",
                variables={
                    "업무제목": f"외국인 긴급신고 — {report.description_ko}",
                    "담당자명": report.kakao_user_key[:8],
                    "발생시각": report.submitted_at.strftime("%Y-%m-%d %H:%M"),
                    "구역": report.location_zone or "미지정",
                    "사진정보": photo_info,
                },
            )
            await self.notif_uc.kakaowork.send(payload)
            logger.info(f"[Chatbot] 관리자 알림 발송: {report.report_id[:8]}")

    def _detect_lang(self, body: dict) -> str:
        """챗봇 사용자 언어 감지 (clientExtra 또는 기본값 'vi')"""
        extra = body.get("action", {}).get("clientExtra", {})
        return extra.get("lang", "vi")
