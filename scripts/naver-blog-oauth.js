#!/usr/bin/env node
// =============================================
// 네이버 블로그 OAuth 2.0 토큰 발급 도우미
//
// 사용법:
//   1. 네이버 개발자센터에서 앱 등록 (아래 안내 참고)
//   2. node scripts/naver-blog-oauth.js
//   3. 브라우저에서 네이버 로그인 + 권한 허용
//   4. 발급된 Access Token을 대시보드 설정에 입력
//
// 필요한 것:
//   - NAVER_BLOG_CLIENT_ID (네이버 개발자센터 앱 Client ID)
//   - NAVER_BLOG_CLIENT_SECRET (네이버 개발자센터 앱 Client Secret)
// =============================================

const http = require('http')
const { URL } = require('url')
const { execSync } = require('child_process')

// =============================================
// 설정
// =============================================

const CLIENT_ID = process.env.NAVER_BLOG_CLIENT_ID || ''
const CLIENT_SECRET = process.env.NAVER_BLOG_CLIENT_SECRET || ''
const CALLBACK_PORT = 9876
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`
const STATE = Math.random().toString(36).substring(2)

// =============================================
// 메인
// =============================================

async function main() {
  console.log('')
  console.log('══════════════════════════════════════════════')
  console.log('  네이버 블로그 OAuth 토큰 발급 도우미')
  console.log('══════════════════════════════════════════════')
  console.log('')

  // 1. Client ID/Secret 확인
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log('  ⚠️  먼저 네이버 개발자센터에서 앱을 등록하세요.')
    console.log('')
    console.log('  === 앱 등록 방법 (5분) ===')
    console.log('')
    console.log('  1. https://developers.naver.com/apps/#/register 접속')
    console.log('  2. "애플리케이션 이름": 스마트스토어 자동화')
    console.log('  3. "사용 API" 선택: "블로그" 체크')
    console.log('  4. "환경 추가": "PC 웹" 선택')
    console.log('     - 서비스 URL: http://localhost')
    console.log(`     - Callback URL: ${CALLBACK_URL}`)
    console.log('  5. "등록하기" 클릭')
    console.log('  6. "내 애플리케이션"에서 Client ID, Client Secret 확인')
    console.log('')
    console.log('  앱 등록 후, .env에 추가:')
    console.log('    NAVER_BLOG_CLIENT_ID=발급받은_Client_ID')
    console.log('    NAVER_BLOG_CLIENT_SECRET=발급받은_Client_Secret')
    console.log('')
    console.log('  그 다음 이 스크립트를 다시 실행하세요:')
    console.log('    node scripts/naver-blog-oauth.js')
    console.log('')
    console.log('══════════════════════════════════════════════')

    // 브라우저로 등록 페이지 열기
    try {
      openBrowser('https://developers.naver.com/apps/#/register')
      console.log('')
      console.log('  → 브라우저에서 개발자센터가 열렸습니다.')
    } catch { /* ignore */ }

    process.exit(1)
  }

  // 2. 로컬 콜백 서버 시작
  console.log(`  콜백 서버 시작: http://localhost:${CALLBACK_PORT}`)

  const token = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`)

      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>인증 실패</h1><p>' + error + '</p><p>창을 닫아주세요.</p>')
        server.close()
        reject(new Error('OAuth 인증 거부: ' + error))
        return
      }

      if (!code || returnedState !== STATE) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>오류</h1><p>인증 코드가 없거나 state 불일치</p>')
        server.close()
        reject(new Error('인증 코드 없음 또는 state 불일치'))
        return
      }

      // 3. Authorization Code → Access Token 교환
      try {
        const tokenUrl = 'https://nid.naver.com/oauth2.0/token'
        const params = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code: code,
          state: STATE,
        })

        const tokenRes = await fetch(`${tokenUrl}?${params.toString()}`)
        const tokenData = await tokenRes.json()

        if (tokenData.error) {
          throw new Error(`토큰 발급 실패: ${tokenData.error_description || tokenData.error}`)
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
            <h1 style="color:#03C75A;">✅ 토큰 발급 성공!</h1>
            <p>터미널에서 토큰을 확인하세요.</p>
            <p style="color:#888;">이 창은 닫아도 됩니다.</p>
          </body></html>
        `)

        server.close()
        resolve(tokenData)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>토큰 발급 실패</h1><p>' + err.message + '</p>')
        server.close()
        reject(err)
      }
    })

    server.listen(CALLBACK_PORT, () => {
      // 4. 네이버 OAuth 인증 페이지 열기
      const authUrl = [
        'https://nid.naver.com/oauth2.0/authorize',
        `?response_type=code`,
        `&client_id=${CLIENT_ID}`,
        `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}`,
        `&state=${STATE}`,
      ].join('')

      console.log('')
      console.log('  → 브라우저에서 네이버 로그인 페이지가 열립니다.')
      console.log('  → 로그인 후 "동의하기"를 클릭하세요.')
      console.log('')

      openBrowser(authUrl)
    })

    // 60초 타임아웃
    setTimeout(() => {
      server.close()
      reject(new Error('타임아웃 (60초)'))
    }, 60000)
  })

  // 5. 결과 출력
  console.log('══════════════════════════════════════════════')
  console.log('  ✅ Access Token 발급 성공!')
  console.log('══════════════════════════════════════════════')
  console.log('')
  console.log('  Access Token:')
  console.log(`  ${token.access_token}`)
  console.log('')
  console.log('  Refresh Token (갱신용):')
  console.log(`  ${token.refresh_token}`)
  console.log('')
  console.log(`  만료: ${token.expires_in}초`)
  console.log('')
  console.log('  → 대시보드 설정 > 네이버 블로그 > Access Token에 붙여넣기')
  console.log('  → 또는 .env에 추가: NAVER_BLOG_ACCESS_TOKEN=' + token.access_token)
  console.log('')
  console.log('══════════════════════════════════════════════')
}

// =============================================
// 유틸
// =============================================

function openBrowser(url) {
  const platform = process.platform
  if (platform === 'win32') {
    execSync(`start "" "${url}"`)
  } else if (platform === 'darwin') {
    execSync(`open "${url}"`)
  } else {
    execSync(`xdg-open "${url}"`)
  }
}

main().catch((err) => {
  console.error('')
  console.error('  ❌ 오류:', err.message)
  console.error('')
  process.exit(1)
})
