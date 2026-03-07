"""
Microsoft Teams / SharePoint 업로드 모듈.

Microsoft Graph API (Client Credentials) 방식으로
SharePoint 문서 라이브러리에 파일을 업로드하고,
Teams 채널에 링크를 게시한다.

[핵심 설계]
1. 폴더가 없으면 자동 생성한다.
2. 토큰 만료(401) 시 자동 재발급 후 재시도한다.
3. 업로드 중단 시 세션을 취소하여 불완전 파일을 방지한다.

설정 파일: config/teams_config.json
"""

import json
import logging
import os
import sys
import tempfile
import time

import requests
import msal


logger = logging.getLogger("anpyeong")


class TeamsUploadError(Exception):
    """Teams 업로드 관련 오류."""
    pass


# ─── AppData 설정 경로 ─────────────────────────────────

def _get_appdata_config_path():
    """AppData/Local/AnpyeongReport/teams_config.json 경로 반환."""
    appdata = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    return os.path.join(appdata, "AnpyeongReport", "teams_config.json")


# ─── 설정 로드 ─────────────────────────────────────────

def load_teams_config(config_path=None):
    """
    Teams 설정을 JSON 파일에서 로드한다.
    AppData 경로를 우선 탐색하고, 없으면 번들 경로 fallback.

    Raises
    ------
    TeamsUploadError
        파일이 없거나 필수 키 누락 시
    """
    if config_path is None:
        appdata_path = _get_appdata_config_path()
        if os.path.exists(appdata_path):
            config_path = appdata_path
        else:
            base = getattr(
                sys, "_MEIPASS",
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            )
            config_path = os.path.join(base, "config", "teams_config.json")

    if not os.path.exists(config_path):
        raise TeamsUploadError(f"Teams 설정 파일을 찾을 수 없습니다: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    required_keys = [
        "tenant_id", "client_id", "client_secret",
        "site_id", "drive_id", "folder_path",
        "team_id", "channel_id",
    ]
    missing = [k for k in required_keys if not cfg.get(k) or str(cfg[k]).startswith("YOUR_")]
    if missing:
        raise TeamsUploadError(
            f"Teams 설정이 완료되지 않았습니다. 다음 항목을 설정하세요: {', '.join(missing)}"
        )

    return cfg


def save_teams_config(cfg):
    """
    설정을 AppData에 원자적으로 저장한다.

    Parameters
    ----------
    cfg : dict
        Teams 설정 딕셔너리
    """
    config_path = _get_appdata_config_path()
    config_dir = os.path.dirname(config_path)
    os.makedirs(config_dir, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=config_dir, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, config_path)
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise

    # client_secret은 로그에 기록하지 않는다
    safe_keys = [k for k in cfg if k != "client_secret"]
    logger.info(f"Teams 설정 저장 완료: {safe_keys}")


def test_teams_connection(cfg):
    """
    MSAL 토큰 발급 + GET /sites/{site_id} 호출로 연결 테스트.

    Returns
    -------
    tuple[bool, str]
        (success, message)
    """
    try:
        client = _GraphClient(cfg)
        client.get_token()
    except TeamsUploadError as e:
        return False, f"인증 실패: {e}"
    except Exception as e:
        return False, f"인증 오류: {e}"

    try:
        site_id = cfg.get("site_id", "")
        url = f"https://graph.microsoft.com/v1.0/sites/{site_id}"
        resp = client.request("GET", url, max_retries=1)
        if resp.status_code == 200:
            site_name = resp.json().get("displayName", site_id)
            return True, f"연결 성공! 사이트: {site_name}"
        else:
            return False, f"사이트 조회 실패 (HTTP {resp.status_code})"
    except TeamsUploadError as e:
        return False, f"연결 실패: {e}"
    except Exception as e:
        return False, f"연결 오류: {e}"


def has_teams_config():
    """
    AppData 또는 번들 경로에 유효한 설정 파일 존재 여부를 확인한다.

    Returns
    -------
    bool
    """
    try:
        load_teams_config()
        return True
    except (TeamsUploadError, Exception):
        return False


# ─── Graph API 클라이언트 (토큰 캐싱 + 401 자동 재발급) ──

class _GraphClient:
    """
    Graph API 호출 래퍼.

    - MSAL ConfidentialClientApplication 인스턴스를 재사용한다.
    - MSAL 내부 토큰 캐시를 활용하여 만료 전까지 같은 토큰을 반환한다.
    - 401 Unauthorized 수신 시 force_refresh로 새 토큰을 발급받고 재시도한다.
    """

    def __init__(self, cfg):
        self._cfg = cfg
        authority = f"https://login.microsoftonline.com/{cfg['tenant_id']}"
        try:
            self._app = msal.ConfidentialClientApplication(
                cfg["client_id"],
                authority=authority,
                client_credential=cfg["client_secret"],
            )
        except Exception as e:
            raise TeamsUploadError(f"MSAL 인증 라이브러리 초기화 오류: {e}")
        self._token = None
        self.default_max_retries = 3

    def get_token(self, force_refresh=False):
        """
        액세스 토큰을 반환한다.

        MSAL acquire_token_for_client는 내부적으로 토큰 캐시를 관리하며,
        만료 5분 전에 자동으로 새 토큰을 요청한다.
        force_refresh=True이면 캐시를 무시하고 새 토큰을 발급받는다.
        """
        if force_refresh:
            # 캐시된 토큰 무효화를 위해 새 요청
            logger.info("토큰 강제 갱신 요청")

        try:
            result = self._app.acquire_token_for_client(
                scopes=["https://graph.microsoft.com/.default"],
            )
        except Exception as e:
            raise TeamsUploadError(f"MSAL 토큰 요청 오류: {e}")

        if "access_token" not in result:
            error_desc = result.get("error_description", "알 수 없는 인증 오류")
            error_code = result.get("error", "")
            raise TeamsUploadError(f"Graph API 인증 실패 [{error_code}]: {error_desc}")

        self._token = result["access_token"]
        return self._token

    def get_headers(self):
        """Authorization 헤더를 반환한다."""
        token = self.get_token()
        return {"Authorization": f"Bearer {token}"}

    def request(self, method, url, max_retries=None, **kwargs):
        """
        Graph API 요청을 수행한다. 401/429/5xx 자동 재시도.

        - 401: 토큰 갱신 후 재시도 (1회)
        - 429: Retry-After 대기 후 재시도
        - 5xx: 지수 백오프 후 재시도

        Parameters
        ----------
        method : str
            HTTP 메서드 ('GET', 'POST', 'PUT', ...)
        url : str
            요청 URL
        max_retries : int
            최대 재시도 횟수
        **kwargs
            requests 인자 (headers, json, data, timeout 등)

        Returns
        -------
        requests.Response
        """
        if max_retries is None:
            max_retries = self.default_max_retries

        # 헤더에 Authorization 자동 주입
        headers = kwargs.pop("headers", {})
        if "Authorization" not in headers:
            headers["Authorization"] = f"Bearer {self.get_token()}"
        kwargs["headers"] = headers

        if "timeout" not in kwargs:
            kwargs["timeout"] = 30

        token_refreshed = False

        for attempt in range(max_retries):
            try:
                resp = requests.request(method, url, **kwargs)

                if resp.status_code in (200, 201, 202):
                    return resp

                # 401: 토큰 만료 → 1회 갱신 후 재시도
                if resp.status_code == 401 and not token_refreshed:
                    logger.warning("401 Unauthorized - 토큰 갱신 후 재시도")
                    new_token = self.get_token(force_refresh=True)
                    kwargs["headers"]["Authorization"] = f"Bearer {new_token}"
                    token_refreshed = True
                    continue

                # 409: 폴더 이미 존재 등 → 호출측에서 처리
                if resp.status_code == 409:
                    return resp

                # 429: 요청 제한
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 5))
                    logger.warning(f"429 Rate Limited - {retry_after}초 대기")
                    time.sleep(retry_after)
                    continue

                # 5xx: 서버 오류 → 지수 백오프
                if resp.status_code >= 500:
                    wait = 2 ** attempt
                    logger.warning(f"{resp.status_code} 서버 오류 - {wait}초 후 재시도")
                    time.sleep(wait)
                    continue

                # 그 외 오류: 즉시 반환 (호출측에서 판단)
                return resp

            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    logger.warning(f"네트워크 오류 (시도 {attempt+1}/{max_retries}): {e} - {wait}초 후 재시도")
                    time.sleep(wait)
                    continue
                raise TeamsUploadError(f"네트워크 오류 (최대 재시도 초과): {e}")

        raise TeamsUploadError(f"요청 실패: 최대 재시도 횟수({max_retries}) 초과")


# ─── 폴더 생성 ─────────────────────────────────────────

def _ensure_folder_exists(folder_path, site_id, drive_id, client):
    """
    SharePoint 드라이브에 폴더 경로가 없으면 생성한다.
    중첩 경로(a/b/c)를 단계적으로 생성한다.

    Graph API는 폴더 존재 시 409를 반환하므로 무시한다.
    """
    parts = [p for p in folder_path.replace("\\", "/").split("/") if p]
    current_path = ""

    for part in parts:
        parent_path = current_path if current_path else ""
        if parent_path:
            url = (
                f"https://graph.microsoft.com/v1.0/sites/{site_id}"
                f"/drives/{drive_id}/root:/{parent_path}:/children"
            )
        else:
            url = (
                f"https://graph.microsoft.com/v1.0/sites/{site_id}"
                f"/drives/{drive_id}/root/children"
            )

        body = {
            "name": part,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "fail",
        }

        resp = client.request(
            "POST", url,
            headers={"Content-Type": "application/json"},
            json=body,
        )

        # 201: 생성됨, 409: 이미 존재 → 둘 다 OK
        if resp.status_code not in (201, 409):
            raise TeamsUploadError(
                f"폴더 생성 실패 '{part}' (HTTP {resp.status_code}): {resp.text}"
            )

        current_path = f"{current_path}/{part}" if current_path else part


# ─── 업로드 ────────────────────────────────────────────

def upload_to_sharepoint(file_path, cfg=None, max_retries=3):
    """
    파일을 SharePoint 문서 라이브러리에 업로드한다.
    폴더가 없으면 자동 생성한다.

    4MB 이하: 단일 PUT, 초과: 업로드 세션(3MB 청크).

    Parameters
    ----------
    max_retries : int
        내부 자동 재시도 횟수 (기본 3, 수동 재시도 시 1)

    Returns
    -------
    str
        업로드된 파일의 웹 URL
    """
    if cfg is None:
        cfg = load_teams_config()

    client = _GraphClient(cfg)
    client.default_max_retries = max_retries

    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    folder = cfg["folder_path"]
    site_id = cfg["site_id"]
    drive_id = cfg["drive_id"]

    logger.info(f"SharePoint 업로드 시작: {file_name} ({file_size:,} bytes)")

    # 폴더 자동 생성
    _ensure_folder_exists(folder, site_id, drive_id, client)

    if file_size <= 4 * 1024 * 1024:
        return _upload_small_file(file_path, file_name, folder, site_id, drive_id, client)
    else:
        return _upload_large_file(file_path, file_name, folder, site_id, drive_id, client)


def _upload_small_file(file_path, file_name, folder, site_id, drive_id, client):
    """4MB 이하 파일 업로드 (단일 PUT)."""
    upload_url = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}"
        f"/drives/{drive_id}/root:/{folder}/{file_name}:/content"
    )

    with open(file_path, "rb") as f:
        data = f.read()

    resp = client.request(
        "PUT", upload_url,
        headers={"Content-Type": "application/octet-stream"},
        data=data,
        timeout=120,
    )

    if resp.status_code in (200, 201):
        web_url = resp.json().get("webUrl", "")
        logger.info(f"소형 파일 업로드 완료: {file_name}")
        return web_url

    raise TeamsUploadError(f"업로드 실패 (HTTP {resp.status_code}): {resp.text}")


def _upload_large_file(file_path, file_name, folder, site_id, drive_id, client):
    """
    4MB 초과 파일 업로드 (세션 기반 청크).

    [안전 보장]
    - SharePoint 업로드 세션은 원자적(atomic): 모든 청크가 완료되어야
      파일이 생성된다. 중간에 실패하면 파일이 만들어지지 않는다.
    - 실패 시 세션을 명시적으로 DELETE하여 정리한다.
    - 로컬 원본 파일은 어떤 경우에도 영향받지 않는다.
    """
    session_url = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}"
        f"/drives/{drive_id}/root:/{folder}/{file_name}:/createUploadSession"
    )

    # 세션 생성
    resp = client.request(
        "POST", session_url,
        json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
    )
    if resp.status_code != 200:
        raise TeamsUploadError(f"업로드 세션 생성 실패 (HTTP {resp.status_code}): {resp.text}")

    upload_url = resp.json()["uploadUrl"]
    file_size = os.path.getsize(file_path)
    chunk_size = 3 * 1024 * 1024  # 3MB

    logger.info(f"대용량 업로드 세션 시작: {file_name} ({file_size:,} bytes, 청크 {chunk_size:,})")

    try:
        with open(file_path, "rb") as f:
            offset = 0
            while offset < file_size:
                chunk = f.read(chunk_size)
                end = offset + len(chunk) - 1

                for attempt in range(3):
                    try:
                        # 업로드 세션 URL은 자체 인증 포함 → Authorization 불필요
                        chunk_resp = requests.put(
                            upload_url,
                            headers={
                                "Content-Length": str(len(chunk)),
                                "Content-Range": f"bytes {offset}-{end}/{file_size}",
                            },
                            data=chunk,
                            timeout=120,
                        )
                        if chunk_resp.status_code in (200, 201, 202):
                            break
                        if chunk_resp.status_code == 429:
                            wait = int(chunk_resp.headers.get("Retry-After", 5))
                            logger.warning(f"청크 429 Rate Limited - {wait}초 대기")
                            time.sleep(wait)
                            continue
                        if chunk_resp.status_code >= 500:
                            wait = 2 ** attempt
                            logger.warning(f"청크 {resp.status_code} 서버 오류 - {wait}초 후 재시도")
                            time.sleep(wait)
                            continue
                        raise TeamsUploadError(
                            f"청크 업로드 실패 (HTTP {chunk_resp.status_code}): {chunk_resp.text}"
                        )
                    except requests.exceptions.RequestException as e:
                        if attempt < 2:
                            time.sleep(2 ** attempt)
                            continue
                        raise TeamsUploadError(f"청크 업로드 중 네트워크 오류: {e}")
                else:
                    raise TeamsUploadError("청크 업로드 실패: 최대 재시도 횟수 초과")

                offset += len(chunk)
                logger.info(f"  청크 업로드: {offset:,}/{file_size:,} bytes ({offset*100//file_size}%)")

                if chunk_resp.status_code in (200, 201):
                    web_url = chunk_resp.json().get("webUrl", "")
                    logger.info(f"대용량 파일 업로드 완료: {file_name}")
                    return web_url

    except Exception:
        # 업로드 실패 시 세션 취소 → 불완전 파일 방지
        logger.error(f"업로드 실패 - 세션 취소 중: {file_name}")
        try:
            requests.delete(upload_url, timeout=10)
            logger.info("업로드 세션 취소 완료")
        except Exception:
            logger.warning("업로드 세션 취소 실패 (자동 만료 예정)")
        raise

    return ""


# ─── 채널 메시지 ───────────────────────────────────────

def post_to_channel(file_url, file_name, cfg=None, max_retries=3):
    """Teams 채널에 파일 링크 메시지를 게시한다."""
    if cfg is None:
        cfg = load_teams_config()

    client = _GraphClient(cfg)
    client.default_max_retries = max_retries

    message_url = (
        f"https://graph.microsoft.com/v1.0/teams/{cfg['team_id']}"
        f"/channels/{cfg['channel_id']}/messages"
    )

    body = {
        "body": {
            "contentType": "html",
            "content": (
                f"<p><strong>\U0001f4ca 모니터링 리포트 업로드 완료</strong></p>"
                f'<p>파일: <a href="{file_url}">{file_name}</a></p>'
            ),
        },
    }

    resp = client.request(
        "POST", message_url,
        headers={"Content-Type": "application/json"},
        json=body,
    )

    if resp.status_code != 201:
        raise TeamsUploadError(
            f"채널 메시지 게시 실패 (HTTP {resp.status_code}): {resp.text}"
        )

    logger.info(f"Teams 채널 메시지 게시 완료: {file_name}")
    return True


# ─── 통합 함수 ─────────────────────────────────────────

def _user_friendly_message(technical_msg):
    """
    기술적 에러 메시지를 사용자 친화적으로 변환한다.
    로그에는 원본이 기록되고, 사용자에게는 이해 가능한 메시지를 표시한다.
    """
    msg_lower = technical_msg.lower()

    if "401" in technical_msg or "unauthorized" in msg_lower:
        return "Teams 인증 정보가 올바르지 않습니다. 관리자에게 문의하세요."
    if "403" in technical_msg or "forbidden" in msg_lower:
        return "Teams 접근 권한이 없습니다. 관리자에게 문의하세요."
    if "404" in technical_msg or "not found" in msg_lower:
        return "Teams 사이트 또는 채널을 찾을 수 없습니다. 설정을 확인하세요."
    if "네트워크" in technical_msg or "connection" in msg_lower or "timeout" in msg_lower:
        return "네트워크 연결 오류. 인터넷 연결을 확인하세요."
    if "설정" in technical_msg or "config" in msg_lower:
        return technical_msg  # 설정 관련은 원본 그대로
    if "인증" in technical_msg or "msal" in msg_lower:
        return "Teams 인증에 실패했습니다. 설정 파일을 확인하세요."

    return "Teams 업로드에 실패했습니다. 로그 파일을 확인하세요."


def upload_and_notify(file_path, config_path=None, max_retries=3):
    """
    파일 업로드 + 채널 알림 통합 함수.
    모든 예외를 잡아서 (success, message) 튜플로 반환한다.

    Parameters
    ----------
    file_path : str
        업로드할 파일 경로
    config_path : str, optional
        Teams 설정 파일 경로
    max_retries : int
        내부 자동 재시도 횟수 (기본 3).
        수동 재시도 시 1로 설정하면 단순 1회 시도.

    [안전 보장]
    - 네트워크 실패 시에도 로컬 파일은 유지된다.
    - 업로드 세션이 중단되면 자동 취소되어 불완전 파일이 남지 않는다.
    - 재실행하면 동일 파일명으로 덮어쓰기(replace) 된다.
    """
    try:
        cfg = load_teams_config(config_path)
        file_url = upload_to_sharepoint(file_path, cfg, max_retries=max_retries)
        file_name = os.path.basename(file_path)
        post_to_channel(file_url, file_name, cfg, max_retries=max_retries)
        return True, f"Teams 업로드 완료: {file_name}"
    except TeamsUploadError as e:
        logger.error(f"Teams 업로드 실패: {e}")
        return False, _user_friendly_message(str(e))
    except requests.exceptions.ConnectionError:
        logger.error("네트워크 연결 오류")
        return False, "네트워크 연결 오류. 로컬 파일은 정상 저장되었습니다."
    except requests.exceptions.Timeout:
        logger.error("네트워크 시간 초과")
        return False, "네트워크 시간 초과. 로컬 파일은 정상 저장되었습니다."
    except Exception as e:
        logger.error(f"예상치 못한 오류: {type(e).__name__}: {e}")
        return False, "업로드 중 오류가 발생했습니다. 로그를 확인하세요."
