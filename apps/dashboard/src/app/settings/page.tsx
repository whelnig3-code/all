'use client'

// =============================================
// 서비스 연동 설정 페이지 (라이트 테마 + 설정 가이드)
// =============================================

import { useState, useEffect, useCallback } from 'react'
import {
  fetchCredentialStatuses,
  fetchSystemStatus,
  updateControl,
  saveServiceCredentials,
  deleteServiceCredentials,
  testServiceConnection,
  type ServiceType,
  type ServiceStatusInfo,
  type CredentialStatus,
} from '../../lib/api'

// =============================================
// 서비스 메타데이터 + 설정 가이드
// =============================================

interface SetupStep {
  title: string
  description: string
  link?: string
  linkLabel?: string
}

interface ServiceMeta {
  label: string
  description: string
  required: boolean
  fields: { key: string; label: string; type: 'text' | 'password'; hint?: string }[]
  setupGuide: SetupStep[]
}

const SERVICE_META: Record<ServiceType, ServiceMeta> = {
  naver_commerce: {
    label: '네이버 커머스 API',
    description: '상품 등록, 주문 관리, 가격 조정에 필요합니다.',
    required: true,
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text', hint: '예: 3jKd8s2...' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', hint: '예: $2a$04$...' },
      { key: 'shopId', label: 'Shop ID (판매자 코드)', type: 'text', hint: '예: ncp_...' },
    ],
    setupGuide: [
      {
        title: '1. 스마트스토어 셀러센터 가입',
        description: '네이버 스마트스토어 셀러센터에 사업자 또는 개인으로 가입합니다.',
        link: 'https://sell.smartstore.naver.com',
        linkLabel: '셀러센터 바로가기',
      },
      {
        title: '2. 커머스 API 애플리케이션 등록',
        description: '네이버 커머스 API 문서에서 "애플리케이션 등록"을 클릭하고, 애플리케이션 이름을 입력합니다. "커머스 API" 권한을 선택하세요.',
        link: 'https://apicenter.commerce.naver.com/ko/basic/overview',
        linkLabel: 'API 센터 바로가기',
      },
      {
        title: '3. Client ID / Client Secret 복사',
        description: '애플리케이션 등록이 완료되면 "내 애플리케이션" 목록에서 Client ID와 Client Secret을 복사합니다.',
      },
      {
        title: '4. 판매자 코드 (Shop ID) 확인',
        description: '셀러센터 > 판매자정보 > 판매자 정보에서 "판매자 코드"를 확인합니다. 이 코드가 Shop ID입니다.',
      },
    ],
  },
  naver_blog: {
    label: '네이버 블로그',
    description: '블로그 자동 포스팅에 필요합니다.',
    required: false,
    fields: [
      { key: 'accessToken', label: 'Access Token', type: 'password', hint: 'AAAA...' },
    ],
    setupGuide: [
      {
        title: '1. 네이버 개발자센터 애플리케이션 등록',
        description: '네이버 개발자센터에서 "애플리케이션 등록"을 클릭합니다. API 권한에서 "블로그"를 선택하세요.',
        link: 'https://developers.naver.com/apps/#/register',
        linkLabel: '개발자센터 바로가기',
      },
      {
        title: '2. Access Token 발급',
        description: '등록 후 "내 애플리케이션"에서 Access Token을 발급합니다. OAuth 인증을 통해 블로그 게시 권한을 획득하세요.',
      },
      {
        title: '3. Access Token 복사',
        description: '발급된 Access Token을 복사하여 아래에 입력합니다.',
      },
    ],
  },
  domaegguk: {
    label: '도매꾹',
    description: '도매꾹 상품 크롤링에 필요합니다.',
    required: true,
    fields: [
      { key: 'username', label: '아이디', type: 'text', hint: '도매꾹 로그인 아이디' },
      { key: 'password', label: '비밀번호', type: 'password', hint: '도매꾹 로그인 비밀번호' },
    ],
    setupGuide: [
      {
        title: '1. 도매꾹 회원가입',
        description: '도매꾹 사이트에서 회원가입을 합니다. 이미 계정이 있다면 2단계로 넘어가세요.',
        link: 'https://domeggook.com',
        linkLabel: '도매꾹 바로가기',
      },
      {
        title: '2. 로그인 정보 입력',
        description: '도매꾹에 로그인할 때 사용하는 아이디와 비밀번호를 그대로 입력하면 됩니다. 별도의 API 키 발급은 필요 없습니다.',
      },
    ],
  },
  ownerclan: {
    label: '오너클랜',
    description: '오너클랜 상품 크롤링에 필요합니다.',
    required: true,
    fields: [
      { key: 'username', label: '아이디', type: 'text', hint: '오너클랜 로그인 아이디' },
      { key: 'password', label: '비밀번호', type: 'password', hint: '오너클랜 로그인 비밀번호' },
    ],
    setupGuide: [
      {
        title: '1. 오너클랜 회원가입',
        description: '오너클랜 사이트에서 회원가입을 합니다. 이미 계정이 있다면 2단계로 넘어가세요.',
        link: 'https://ownerclan.com',
        linkLabel: '오너클랜 바로가기',
      },
      {
        title: '2. 로그인 정보 입력',
        description: '오너클랜에 로그인할 때 사용하는 아이디와 비밀번호를 그대로 입력하면 됩니다. 별도의 API 키 발급은 필요 없습니다.',
      },
    ],
  },
  naver_talktalk: {
    label: '네이버 톡톡',
    description: '고객 문의 자동 응답에 필요합니다.',
    required: false,
    fields: [
      { key: 'accountId', label: '톡톡 계정 ID', type: 'text', hint: '셀러센터 > 톡톡 설정에서 확인' },
    ],
    setupGuide: [
      {
        title: '1. 스마트스토어 톡톡 활성화',
        description: '셀러센터 > 톡톡 > 톡톡 관리에서 톡톡 기능을 활성화합니다.',
      },
      {
        title: '2. 톡톡 계정 ID 확인',
        description: '톡톡 관리 페이지에서 계정 ID를 확인하여 입력합니다.',
      },
    ],
  },
  onchannel: {
    label: '온채널',
    description: '온채널 상품 크롤링에 필요합니다.',
    required: false,
    fields: [
      { key: 'username', label: '아이디', type: 'text', hint: '온채널 로그인 아이디' },
      { key: 'password', label: '비밀번호', type: 'password', hint: '온채널 로그인 비밀번호' },
    ],
    setupGuide: [
      {
        title: '1. 온채널 회원가입',
        description: '온채널 사이트에서 회원가입을 합니다. 이미 계정이 있다면 2단계로 넘어가세요.',
        link: 'https://onchannel.co.kr',
        linkLabel: '온채널 바로가기',
      },
      {
        title: '2. 로그인 정보 입력',
        description: '온채널에 로그인할 때 사용하는 아이디와 비밀번호를 그대로 입력하면 됩니다.',
      },
    ],
  },
  telegram: {
    label: '텔레그램 알림',
    description: '실시간 알림 발송에 필요합니다.',
    required: false,
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', hint: '예: 123456:ABC-DEF...' },
      { key: 'chatId', label: 'Chat ID', type: 'text', hint: '예: 123456789' },
    ],
    setupGuide: [
      {
        title: '1. 텔레그램 설치',
        description: '텔레그램 앱이 없다면 먼저 설치하고 계정을 만드세요.',
        link: 'https://telegram.org',
        linkLabel: '텔레그램 다운로드',
      },
      {
        title: '2. BotFather에서 봇 생성',
        description: '텔레그램에서 @BotFather를 검색하여 대화를 시작합니다. /newbot 명령을 입력하고, 봇 이름과 사용자명을 설정하세요. 완료되면 Bot Token이 발급됩니다.',
      },
      {
        title: '3. Bot Token 복사',
        description: 'BotFather가 보내준 메시지에서 "Use this token to access the HTTP API:" 아래의 토큰을 복사합니다. (형식: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)',
      },
      {
        title: '4. Chat ID 확인',
        description: '방금 만든 봇에게 아무 메시지를 보낸 후, 브라우저에서 아래 URL을 열어 Chat ID를 확인합니다.\nhttps://api.telegram.org/bot{토큰}/getUpdates\n응답에서 "chat":{"id": 여기 숫자} 부분이 Chat ID입니다.',
      },
    ],
  },
}

const ALL_SERVICES: ServiceType[] = [
  'naver_commerce',
  'naver_blog',
  'naver_talktalk',
  'domaegguk',
  'ownerclan',
  'onchannel',
  'telegram',
]

// =============================================
// 상태 배지
// =============================================

function CredentialStatusBadge({ status }: { status: CredentialStatus }) {
  if (status === 'configured') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        연결됨
      </span>
    )
  }
  if (status === 'test_failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        인증 실패
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      미설정
    </span>
  )
}

// =============================================
// 설정 가이드 컴포넌트
// =============================================

function SetupGuidePanel({ steps }: { steps: SetupStep[] }) {
  return (
    <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-bold text-blue-800">설정 방법</span>
      </div>
      <ol className="space-y-3">
        {steps.map((step, idx) => (
          <li key={idx} className="text-sm">
            <p className="font-medium text-gray-800">{step.title}</p>
            <p className="text-gray-600 mt-0.5 whitespace-pre-line">{step.description}</p>
            {step.link && (
              <a
                href={step.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
              >
                {step.linkLabel ?? '바로가기'}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

// =============================================
// 입력 모달
// =============================================

function CredentialModal({
  service,
  meta,
  existingFields,
  onClose,
  onSaved,
}: {
  service: ServiceType
  meta: ServiceMeta
  existingFields: Record<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of meta.fields) {
      init[f.key] = ''
    }
    return init
  })
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  const handleFieldChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSaveAndTest = async () => {
    const emptyFields = meta.fields.filter((f) => !fields[f.key]?.trim())
    if (emptyFields.length > 0) {
      setError(`모든 필드를 입력하세요: ${emptyFields.map((f) => f.label).join(', ')}`)
      return
    }

    setError(null)
    setSaving(true)
    setTestResult(null)

    try {
      await saveServiceCredentials(service, fields)
      setSaving(false)
      setTesting(true)

      const result = await testServiceConnection(service)
      setTestResult({ success: result.success, message: result.message })
      setTesting(false)

      if (result.success) {
        setTimeout(() => {
          onSaved()
          onClose()
        }, 1500)
      }
    } catch (err) {
      setSaving(false)
      setTesting(false)
      setError(err instanceof Error ? err.message : '저장 실패')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 border border-gray-200 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl">
          <h3 className="text-lg font-bold text-gray-900">{meta.label} 설정</h3>
          <p className="text-sm text-gray-500 mt-1">{meta.description}</p>
        </div>

        {/* 가이드 토글 */}
        <div className="px-6 pt-4">
          <button
            onClick={() => setShowGuide((prev) => !prev)}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${showGuide ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showGuide ? '가이드 접기' : '어디서 발급받나요? (설정 방법 보기)'}
          </button>
          {showGuide && <SetupGuidePanel steps={meta.setupGuide} />}
        </div>

        {/* 필드 입력 */}
        <div className="px-6 py-4 space-y-4">
          {meta.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
              </label>
              <div className="relative">
                <input
                  type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                  value={fields[field.key]}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={existingFields[field.key] || field.hint || `${field.label} 입력`}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => togglePasswordVisibility(field.key)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswords[field.key] ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 에러/결과 메시지 */}
        {error && (
          <div className="mx-6 mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}
        {testResult && (
          <div className={`mx-6 mb-4 px-3 py-2 rounded-lg text-sm border ${
            testResult.success
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {testResult.message}
          </div>
        )}

        {/* 버튼 */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSaveAndTest}
            disabled={saving || testing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? '저장 중...' : testing ? '테스트 중...' : '저장 및 테스트'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================
// 판매자 유형 선택 카드
// =============================================

type SellerType = 'individual' | 'business'

function SellerTypeCard({
  value,
  onChange,
  saving,
}: {
  value: SellerType
  onChange: (type: SellerType) => void
  saving: boolean
}) {
  const options: { type: SellerType; label: string; desc: string }[] = [
    { type: 'individual', label: '개인 판매자', desc: '사업자 등록 없이 판매 (일부 카테고리 제한)' },
    { type: 'business', label: '사업자 판매자', desc: '사업자 등록 완료 (모든 카테고리 가능)' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <h2 className="font-bold text-gray-900">판매자 유형</h2>
        {saving && <span className="text-xs text-blue-500 animate-pulse">저장 중...</span>}
      </div>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.type}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              value === opt.type
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="sellerType"
              checked={value === opt.type}
              onChange={() => onChange(opt.type)}
              className="mt-0.5 accent-blue-600"
            />
            <div>
              <span className="font-medium text-gray-900 text-sm">{opt.label}</span>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p className="text-xs text-amber-700">
          개인 판매자는 건강기능식품, 의료기기, 주류 등 사업자 전용 카테고리가 자동으로 제외됩니다.
        </p>
      </div>
    </div>
  )
}

// =============================================
// 서비스 카드
// =============================================

function ServiceCard({
  service,
  statusInfo,
  stepNumber,
  onEdit,
  onDelete,
  onTest,
}: {
  service: ServiceType
  statusInfo: ServiceStatusInfo | null
  stepNumber: number
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
}) {
  const meta = SERVICE_META[service]
  const status = statusInfo?.status ?? 'not_configured'
  const fields = statusInfo?.fields ?? {}
  const isConfigured = status !== 'not_configured'
  const [showGuide, setShowGuide] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-3">
          {/* 단계 번호 */}
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
            isConfigured
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {isConfigured ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              stepNumber
            )}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              {meta.label}
              {meta.required && (
                <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-medium">필수</span>
              )}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{meta.description}</p>
          </div>
        </div>
        <CredentialStatusBadge status={status} />
      </div>

      {/* 마스킹된 필드 표시 */}
      {isConfigured && (
        <div className="mb-3 ml-10 space-y-1">
          {meta.fields.map((field) => (
            <div key={field.key} className="flex items-center text-sm">
              <span className="text-gray-400 w-28">{field.label}:</span>
              <span className="text-gray-600 font-mono text-xs">
                {fields[field.key] || '****'}
              </span>
            </div>
          ))}
          {statusInfo?.lastTestedAt && (
            <div className="flex items-center text-sm mt-2">
              <span className="text-gray-400 w-28">마지막 테스트:</span>
              <span className="text-gray-500 text-xs">
                {new Date(statusInfo.lastTestedAt).toLocaleString('ko-KR')}
              </span>
            </div>
          )}
          {statusInfo?.testError && (
            <div className="mt-2 px-2 py-1 bg-red-50 border border-red-100 rounded text-red-600 text-xs">
              {statusInfo.testError}
            </div>
          )}
        </div>
      )}

      {/* 가이드 토글 (미설정 시 자동 표시 옵션) */}
      {!isConfigured && (
        <div className="ml-10 mb-3">
          <button
            onClick={() => setShowGuide((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${showGuide ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showGuide ? '가이드 접기' : '어디서 발급받나요?'}
          </button>
          {showGuide && <SetupGuidePanel steps={meta.setupGuide} />}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-2 ml-10">
        <button
          onClick={onEdit}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            isConfigured
              ? 'bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700'
              : 'bg-blue-600 hover:bg-blue-700 text-white font-medium'
          }`}
        >
          {isConfigured ? '수정' : '설정하기'}
        </button>
        {isConfigured && (
          <>
            <button
              onClick={onTest}
              className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-colors"
            >
              테스트
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors"
            >
              삭제
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// =============================================
// 메인 페이지
// =============================================

export default function SettingsPage() {
  const [statuses, setStatuses] = useState<ServiceStatusInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingService, setEditingService] = useState<ServiceType | null>(null)
  const [testingService, setTestingService] = useState<ServiceType | null>(null)
  const [sellerType, setSellerType] = useState<SellerType>('individual')
  const [sellerTypeSaving, setSellerTypeSaving] = useState(false)

  const loadStatuses = useCallback(async () => {
    try {
      const [credResult, sysResult] = await Promise.all([
        fetchCredentialStatuses(),
        fetchSystemStatus(),
      ])
      setStatuses(credResult.services)
      // 서버에서 SELLER_TYPE 읽기 (기본값: individual)
      const serverSellerType = sysResult.settings.SELLER_TYPE
      if (serverSellerType === 'business' || serverSellerType === 'individual') {
        setSellerType(serverSellerType)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '상태 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSellerTypeChange = async (type: SellerType) => {
    setSellerType(type) // optimistic update
    setSellerTypeSaving(true)
    try {
      await updateControl('SELLER_TYPE', type)
    } catch (err) {
      // rollback
      setSellerType(type === 'business' ? 'individual' : 'business')
      setError(err instanceof Error ? err.message : '판매자 유형 저장 실패')
    } finally {
      setSellerTypeSaving(false)
    }
  }

  useEffect(() => {
    loadStatuses()
  }, [loadStatuses])

  const handleDelete = async (service: ServiceType) => {
    if (!confirm(`${SERVICE_META[service].label} 자격증명을 삭제하시겠습니까?`)) return
    try {
      await deleteServiceCredentials(service)
      await loadStatuses()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  const handleTest = async (service: ServiceType) => {
    setTestingService(service)
    try {
      await testServiceConnection(service)
      await loadStatuses()
    } catch (err) {
      setError(err instanceof Error ? err.message : '테스트 실패')
    } finally {
      setTestingService(null)
    }
  }

  const getStatusForService = (service: ServiceType): ServiceStatusInfo | null => {
    return statuses.find((s) => s.service === service) ?? null
  }

  const requiredServices = ALL_SERVICES.filter((s) => SERVICE_META[s].required)
  const optionalServices = ALL_SERVICES.filter((s) => !SERVICE_META[s].required)
  const requiredReady = requiredServices.every((s) => {
    const info = getStatusForService(s)
    return info?.status === 'configured'
  })
  const completedCount = ALL_SERVICES.filter((s) => {
    const info = getStatusForService(s)
    return info?.status === 'configured'
  }).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 페이지 헤더 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">서비스 연동 설정</h1>
        <p className="text-sm text-gray-500 mt-1">
          아래 서비스를 위에서부터 순서대로 설정하세요. 필수 서비스 3개가 모두 완료되면 자동화가 시작됩니다.
        </p>
      </div>

      {/* 진행 상태 바 */}
      <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">설정 진행률</span>
          <span className="text-sm font-bold text-blue-600">{completedCount}/{ALL_SERVICES.length} 완료</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / ALL_SERVICES.length) * 100}%` }}
          />
        </div>
        {requiredReady ? (
          <p className="text-xs text-green-600 font-medium mt-2">
            필수 서비스 설정 완료! 자동화를 시작할 수 있습니다.
          </p>
        ) : (
          <p className="text-xs text-amber-600 mt-2">
            필수 서비스를 모두 설정하면 자동화가 시작됩니다.
          </p>
        )}
      </div>

      {/* 판매자 유형 선택 */}
      <div className="mb-6">
        <SellerTypeCard
          value={sellerType}
          onChange={handleSellerTypeChange}
          saving={sellerTypeSaving}
        />
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm">서비스 상태를 불러오는 중...</p>
        </div>
      ) : (
        <>
          {/* 필수 서비스 */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
              필수 서비스
            </h2>
            <div className="space-y-3">
              {requiredServices.map((service, idx) => (
                <ServiceCard
                  key={service}
                  service={service}
                  statusInfo={getStatusForService(service)}
                  stepNumber={idx + 1}
                  onEdit={() => setEditingService(service)}
                  onDelete={() => handleDelete(service)}
                  onTest={() => handleTest(service)}
                />
              ))}
            </div>
          </div>

          {/* 선택 서비스 */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
              선택 서비스 (나중에 설정해도 됩니다)
            </h2>
            <div className="space-y-3">
              {optionalServices.map((service, idx) => (
                <ServiceCard
                  key={service}
                  service={service}
                  statusInfo={getStatusForService(service)}
                  stepNumber={requiredServices.length + idx + 1}
                  onEdit={() => setEditingService(service)}
                  onDelete={() => handleDelete(service)}
                  onTest={() => handleTest(service)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* 입력 모달 */}
      {editingService && (
        <CredentialModal
          service={editingService}
          meta={SERVICE_META[editingService]}
          existingFields={getStatusForService(editingService)?.fields ?? {}}
          onClose={() => setEditingService(null)}
          onSaved={loadStatuses}
        />
      )}
    </div>
  )
}
