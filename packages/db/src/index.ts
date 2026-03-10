// =============================================
// DB 클라이언트 싱글톤
// =============================================
import { PrismaClient } from '@prisma/client'

// 개발 환경에서 HMR로 인한 다중 인스턴스 방지
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  })

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}

export { PrismaClient }
export type { Prisma } from '@prisma/client'
