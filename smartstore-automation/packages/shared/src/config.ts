// =============================================
// 환경변수 설정 - 타입 안전한 config 객체
// =============================================

/** 필수 환경변수 검증 */
function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`필수 환경변수 누락: ${key}`)
  }
  return value
}

/** 선택적 환경변수 (기본값 포함) */
function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue
}

/** 전체 설정 객체 */
export const config = {
  // 데이터베이스
  database: {
    url: optionalEnv('DATABASE_URL', 'postgresql://user:password@localhost:5432/smartstore'),
  },

  // 네이버 커머스 API
  naver: {
    clientId: optionalEnv('NAVER_CLIENT_ID', ''),
    clientSecret: optionalEnv('NAVER_CLIENT_SECRET', ''),
    shopId: optionalEnv('NAVER_SHOP_ID', ''),
    apiBaseUrl: optionalEnv(
      'NAVER_COMMERCE_API_BASE_URL',
      'https://api.commerce.naver.com'
    ),
  },

  // 번역 서비스
  translator: {
    adapter: optionalEnv('TRANSLATOR_ADAPTER', 'google-free') as 'google-free' | 'deepl',
    deeplApiKey: optionalEnv('DEEPL_API_KEY', ''),
  },

  // 알림 서비스
  notification: {
    adapter: optionalEnv('NOTIFICATION_ADAPTER', 'telegram') as 'telegram' | 'sms',
    telegram: {
      botToken: optionalEnv('TELEGRAM_BOT_TOKEN', ''),
      chatId: optionalEnv('TELEGRAM_CHAT_ID', ''),
    },
    sms: {
      apiKey: optionalEnv('SMS_API_KEY', ''),
      fromNumber: optionalEnv('SMS_FROM_NUMBER', ''),
    },
  },

  // LLM
  llm: {
    adapter: optionalEnv('LLM_ADAPTER', 'ollama') as 'ollama' | 'openai',
    ollamaBaseUrl: optionalEnv('OLLAMA_BASE_URL', 'http://localhost:11434'),
    ollamaModel: optionalEnv('OLLAMA_MODEL', 'llama3.2'),
    openaiApiKey: optionalEnv('OPENAI_API_KEY', ''),
    openaiModel: optionalEnv('OPENAI_MODEL', 'gpt-4o-mini'),
  },

  // Redis (BullMQ)
  redis: {
    host: optionalEnv('REDIS_HOST', 'localhost'),
    port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
    password: optionalEnv('REDIS_PASSWORD', ''),
  },

  // 구매대행 (Phase 5+)
  sourcing: {
    aliexpressEnabled: optionalEnv('SOURCING_ALIEXPRESS_ENABLED', 'false') === 'true',
    taobaoEnabled: optionalEnv('SOURCING_TAOBAO_ENABLED', 'false') === 'true',
  },

  // 환율 API
  exchangeRate: {
    apiKey: optionalEnv('EXCHANGE_RATE_API_KEY', ''),
  },

  // 가격 모니터링
  priceMonitor: {
    // 기본 1시간마다 경쟁가 체크
    intervalMs: parseInt(
      optionalEnv('PRICE_MONITOR_INTERVAL_MS', '3600000'),
      10
    ),
  },

  // 재고 관리
  inventory: {
    safeStock: parseInt(optionalEnv('SAFE_STOCK', '2'), 10),
    pollIntervalMs: parseInt(optionalEnv('INVENTORY_POLL_INTERVAL_MS', '600000'), 10),
    maxRetry: parseInt(optionalEnv('INVENTORY_MAX_RETRY', '3'), 10),
    cacheTtlMs: parseInt(optionalEnv('STOCK_CACHE_TTL_MS', '600000'), 10),
  },

  // 주문 승인 (Phase 4.5)
  approval: {
    timeoutMs: parseInt(optionalEnv('APPROVAL_TIMEOUT_MS', '300000'), 10),
  },

  // 시스템
  system: {
    nodeEnv: optionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
    logLevel: optionalEnv('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
    port: parseInt(optionalEnv('PORT', '3100'), 10),
  },
}

export type Config = typeof config
