"""
메시지 템플릿 저장소 — Phase 1에서는 코드 내 하드코딩
Phase 2 전환 시 DB message_templates 테이블로 대체
"""

# template_key → language → channel → body
_TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    "task_assigned": {
        "KO": {
            "KAKAO_ALIMTALK": (
                "[JAEWOO OPS] 업무 배정 안내\n\n"
                "안녕하세요, {{담당자명}}님.\n"
                "새로운 업무가 배정되었습니다.\n\n"
                "■ 업무명: {{업무제목}}\n"
                "■ 유형: {{업무유형}}\n"
                "■ 마감일: {{마감일}} ({{요일}})\n"
                "■ 우선순위: {{우선순위}}\n\n"
                "▶ 완료 처리: {{완료링크}}"
            ),
            "KAKAOWORK_BOT": (
                "[JAEWOO OPS] 업무 배정 안내\n\n"
                "안녕하세요, {{담당자명}}님.\n"
                "■ 업무명: {{업무제목}}\n"
                "■ 마감일: {{마감일}} ({{요일}})\n"
                "■ 우선순위: {{우선순위}}"
            ),
        },
        "VN": {
            "KAKAO_ALIMTALK": (
                "[JAEWOO OPS] Thông báo công việc\n\n"
                "Xin chào, {{담당자명}}.\n"
                "Bạn có công việc mới được giao.\n\n"
                "■ Tên công việc: {{업무제목}}\n"
                "■ Loại: {{업무유형}}\n"
                "■ Hạn chót: {{마감일}} ({{요일}})\n\n"
                "▶ Hoàn thành: {{완료링크}}"
            ),
        },
    },
    "task_overdue": {
        "KO": {
            "KAKAO_ALIMTALK": (
                "[JAEWOO OPS] 업무 미완료 알림\n\n"
                "{{담당자명}}님, 아래 업무가 마감을 초과했습니다.\n\n"
                "■ 업무명: {{업무제목}}\n"
                "■ 마감일: {{마감일}}\n"
                "■ 지연: {{지연일수}}일\n\n"
                "▶ 완료 처리: {{완료링크}}"
            ),
        },
    },
    "equipment_escalation_3": {
        "KO": {
            "KAKAOWORK_BOT": (
                "[JAEWOO OPS] 설비점검 미완료 알림\n\n"
                "{{팀장명}} 팀장님,\n"
                "아래 설비점검이 미완료 상태입니다.\n\n"
                "■ 점검명: {{업무제목}}\n"
                "■ 담당자: {{담당자명}}\n"
                "■ 마감일: {{마감일}} ({{요일}})\n"
                "■ 상태: 미완료 (에스컬레이션 3단계)\n\n"
                "확인 부탁드립니다."
            ),
        },
    },
    "daily_summary": {
        "KO": {
            "KAKAO_ALIMTALK": (
                "[JAEWOO OPS] 오늘의 업무 안내\n\n"
                "안녕하세요, {{담당자명}}님.\n"
                "오늘 처리 대상 업무 {{건수}}건입니다.\n\n"
                "{{업무목록}}\n\n"
                "▶ 상세 확인: {{대시보드링크}}"
            ),
        },
    },
    "emergency_started": {
        "KO": {
            "KAKAOWORK_BOT": (
                "🚨 [긴급] 긴급업무 발생\n\n"
                "■ 업무명: {{업무제목}}\n"
                "■ 대응자: {{담당자명}}\n"
                "■ 발생시각: {{발생시각}}\n\n"
                "즉시 대응 바랍니다."
            ),
        },
    },
    "emergency_resolved": {
        "KO": {
            "KAKAOWORK_BOT": (
                "✅ [긴급 해결] 긴급업무 완료\n\n"
                "■ 업무명: {{업무제목}}\n"
                "■ 대응자: {{담당자명}}\n"
                "■ 소요시간: {{소요시간}}분\n\n"
                "긴급 대응 완료되었습니다."
            ),
        },
    },
}

_FALLBACK_TEMPLATE = "[JAEWOO OPS] 알림: {{업무제목}}"


def get_template(template_key: str, language: str, channel: str) -> str:
    """
    템플릿 조회 (우선순위: 언어 맞춤 → KO → fallback)
    """
    by_lang = _TEMPLATES.get(template_key, {})
    by_channel = by_lang.get(language) or by_lang.get("KO") or {}
    return by_channel.get(channel) or _FALLBACK_TEMPLATE
