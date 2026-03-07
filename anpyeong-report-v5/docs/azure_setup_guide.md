# Azure AD / Teams 설정 가이드

안평리 리포트 생성기 v5.0의 Teams 자동 업로드 기능을 사용하려면
Azure AD 앱 등록과 SharePoint/Teams 설정이 필요합니다.

---

## 1. Azure AD 앱 등록

### 1.1 앱 만들기
1. [Azure Portal](https://portal.azure.com) 접속
2. **Azure Active Directory** → **앱 등록** → **새 등록**
3. 설정:
   - 이름: `안평리-리포트-업로더`
   - 지원되는 계정 유형: **이 조직 디렉터리의 계정만**
   - 리디렉션 URI: (비워두기)
4. **등록** 클릭

### 1.2 값 기록
등록 완료 후 **개요** 페이지에서 다음 값을 복사합니다:

| 항목 | teams_config.json 키 |
|---|---|
| 애플리케이션(클라이언트) ID | `client_id` |
| 디렉터리(테넌트) ID | `tenant_id` |

### 1.3 클라이언트 비밀 생성
1. **인증서 및 비밀** → **새 클라이언트 비밀**
2. 설명: `리포트 업로드`
3. 만료: 24개월 (권장)
4. **추가** 클릭
5. 생성된 **값**을 즉시 복사 → `client_secret`

### 1.4 API 권한 추가
1. **API 권한** → **권한 추가** → **Microsoft Graph**
2. **애플리케이션 권한** 선택
3. 다음 권한을 추가:
   - `Files.ReadWrite.All` — SharePoint 파일 업로드
   - `Sites.ReadWrite.All` — 사이트 접근
   - `ChannelMessage.Send` — 채널 메시지 게시
4. **관리자 동의 부여** 클릭 (테넌트 관리자 필요)

---

## 2. SharePoint 사이트/드라이브 ID 확인

### 2.1 사이트 ID
Graph Explorer 또는 브라우저에서:
```
https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{site-name}
```
응답의 `id` 값 → `site_id`

### 2.2 드라이브 ID
```
https://graph.microsoft.com/v1.0/sites/{site_id}/drives
```
문서 라이브러리 드라이브의 `id` 값 → `drive_id`

### 간편 확인법 (PowerShell):
```powershell
# Graph Explorer에서 토큰 발급 후
$headers = @{ Authorization = "Bearer <토큰>" }

# 사이트 검색
Invoke-RestMethod "https://graph.microsoft.com/v1.0/sites?search=팀사이트명" -Headers $headers

# 드라이브 목록
Invoke-RestMethod "https://graph.microsoft.com/v1.0/sites/<site_id>/drives" -Headers $headers
```

---

## 3. Teams 채널 ID 확인

### 3.1 팀 ID
```
https://graph.microsoft.com/v1.0/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')
```
해당 팀의 `id` → `team_id`

### 3.2 채널 ID
```
https://graph.microsoft.com/v1.0/teams/{team_id}/channels
```
대상 채널의 `id` → `channel_id`

---

## 4. teams_config.json 설정

`config/teams_config.json` 파일을 다음과 같이 수정합니다:

```json
{
    "tenant_id": "12345678-abcd-...",
    "client_id": "87654321-dcba-...",
    "client_secret": "비밀값~...",
    "site_id": "contoso.sharepoint.com,guid1,guid2",
    "drive_id": "b!abcdef...",
    "folder_path": "안평리_모니터링_리포트",
    "team_id": "aaaabbbb-cccc-...",
    "channel_id": "19:xxxxxxxx@thread.tacv2"
}
```

### 폴더 경로 (folder_path)
SharePoint 문서 라이브러리 내 업로드 대상 폴더명입니다.
폴더가 존재하지 않으면 자동 생성됩니다.

---

## 5. 권한 요약

| 권한 | 유형 | 용도 |
|---|---|---|
| Files.ReadWrite.All | 애플리케이션 | 파일 업로드 |
| Sites.ReadWrite.All | 애플리케이션 | 사이트 접근 |
| ChannelMessage.Send | 애플리케이션 | 채널 메시지 |

**모든 권한은 관리자 동의가 필요합니다.**

---

## 6. 테스트

설정 완료 후 프로그램에서 Teams 업로드 체크박스를 활성화하고
리포트를 생성하여 업로드가 정상적으로 되는지 확인합니다.

업로드 실패 시 GUI 상태 메시지 영역에 오류 내용이 표시됩니다.
네트워크 오류 시에도 로컬 파일은 정상 저장됩니다.

---

## 7. 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| `AADSTS7000215` | 잘못된 client_secret | 비밀 재생성 |
| `AADSTS700016` | 잘못된 client_id | 앱 등록 확인 |
| `403 Forbidden` | 권한 부족 | 관리자 동의 확인 |
| `404 Not Found` | 잘못된 site_id/drive_id | ID 재확인 |
| 연결 오류 | 네트워크 차단 | 방화벽/프록시 확인 |
