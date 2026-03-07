// =============================================
// 로거 - 구조화된 로그 출력
// =============================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/** 현재 설정된 로그 레벨 */
const currentLevel = (process.env['LOG_LEVEL'] ?? 'info') as LogLevel

/** 로그 출력 여부 결정 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

/** 타임스탬프 생성 */
function timestamp(): string {
  return new Date().toISOString()
}

/** 로그 포맷팅 */
function format(level: LogLevel, namespace: string, message: string, meta?: unknown): string {
  const base = `[${timestamp()}] [${level.toUpperCase()}] [${namespace}] ${message}`
  if (meta !== undefined) {
    return `${base} ${JSON.stringify(meta)}`
  }
  return base
}

/** 네임스페이스별 로거 생성 */
export function createLogger(namespace: string) {
  return {
    debug(message: string, meta?: unknown) {
      if (shouldLog('debug')) {
        console.debug(format('debug', namespace, message, meta))
      }
    },

    info(message: string, meta?: unknown) {
      if (shouldLog('info')) {
        console.info(format('info', namespace, message, meta))
      }
    },

    warn(message: string, meta?: unknown) {
      if (shouldLog('warn')) {
        console.warn(format('warn', namespace, message, meta))
      }
    },

    error(message: string, error?: unknown) {
      if (shouldLog('error')) {
        const meta = error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error
        console.error(format('error', namespace, message, meta))
      }
    },
  }
}

export type Logger = ReturnType<typeof createLogger>
