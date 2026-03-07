from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_env: str = "development"
    secret_key: str = "dev-secret-key"

    # Excel (Phase 1)
    excel_file_path: str = "./excel/JAEWOO_OPS_운영대장.xlsx"

    # 완료 링크 베이스 URL
    base_url: str = "http://localhost:8000"

    # 카카오 알림톡 (SOLAPI)
    solapi_api_key: str = ""
    solapi_api_secret: str = ""
    solapi_sender_phone: str = ""
    solapi_kakao_pf_id: str = ""

    # 카카오워크 봇
    kakaowork_bot_token: str = ""

    # 구글 번역 API (외국인 챗봇용, 선택사항)
    google_translate_api_key: str = ""

    # SMS 대체 발송
    sms_fallback_enabled: bool = False

    # 알림 정책
    max_daily_alerts: int = 2
    completion_token_ttl_hours: int = 72


settings = Settings()
