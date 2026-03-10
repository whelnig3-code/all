// =============================================
// 일일 리포트 작업 (Phase C)
//
// 비유: 매장 폐점 후 하루 매출 정산.
// 오늘 매출, 마진, 반품, 재고를 전일과 비교하여
// 이상 징후가 있으면 즉시 알림.
//
// anomaly-detector 연결: 전일 대비 급변 자동 감지
// =============================================

import { Worker, Job } from 'bullmq'
import { createLogger } from '@smartstore/shared'
import { detectAnomalies, type DailyMetrics, type AnomalyResult } from '@smartstore/core'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type DailyReportJobData } from '../queues'

const logger = createLogger('daily-report-job')

export interface DailyReport {
  readonly date: string
  readonly metrics: DailyMetrics
  readonly anomalyResult: AnomalyResult
  readonly notificationMessage: string
}

/**
 * 특정 날짜의 매출/주문/마진/반품/재고 지표 집계
 */
export async function collectDailyMetrics(
  targetDate: string,
  accountId: string,
): Promise<DailyMetrics> {
  const dayStart = new Date(`${targetDate}T00:00:00+09:00`)
  const dayEnd = new Date(`${targetDate}T23:59:59+09:00`)

  const dateFilter = { gte: dayStart, lte: dayEnd }

  const [orderAgg, returnCount, stockAgg] = await Promise.all([
    prisma.order.aggregate({
      where: { accountId, orderedAt: dateFilter },
      _sum: { totalAmount: true, marginAmount: true },
      _count: { id: true },
    }),
    prisma.order.count({
      where: { accountId, status: 'cancelled', cancelledAt: dateFilter },
    }),
    prisma.product.aggregate({
      where: { accountId, status: 'active' },
      _sum: { cachedStock: true },
    }),
  ])

  const revenue = orderAgg._sum.totalAmount ?? 0
  const marginTotal = orderAgg._sum.marginAmount ?? 0
  const orders = orderAgg._count.id

  return {
    revenue,
    orders,
    avgMarginRate: revenue > 0 ? marginTotal / revenue : 0,
    returns: returnCount,
    stockLevel: stockAgg._sum.cachedStock ?? 0,
  }
}

/**
 * 전일 대비 리포트 생성 (anomaly-detector 연결)
 */
export function buildDailyReport(
  today: DailyMetrics,
  previous: DailyMetrics,
  date: string,
): DailyReport {
  const anomalyResult = detectAnomalies(today, previous)

  const notificationMessage = anomalyResult.hasAnomaly
    ? [
        `📊 일일 리포트 (${date}) — ⚠️ 이상 감지`,
        `매출: ${today.revenue.toLocaleString()}원 (전일 ${previous.revenue.toLocaleString()}원)`,
        `주문: ${today.orders}건 | 마진율: ${(today.avgMarginRate * 100).toFixed(1)}%`,
        `반품: ${today.returns}건 | 재고: ${today.stockLevel}개`,
        '',
        ...anomalyResult.anomalies.map((a) => `${a.severity === 'critical' ? '🔴' : '🟡'} ${a.message}`),
      ].join('\n')
    : [
        `📊 일일 리포트 (${date}) — ✅ 정상`,
        `매출: ${today.revenue.toLocaleString()}원 | 주문: ${today.orders}건`,
        `마진율: ${(today.avgMarginRate * 100).toFixed(1)}% | 반품: ${today.returns}건`,
      ].join('\n')

  return { date, metrics: today, anomalyResult, notificationMessage }
}

/**
 * 일일 리포트 워커 생성
 */
export function createDailyReportWorker(): Worker {
  const worker = new Worker<DailyReportJobData>(
    QUEUE_NAMES.DAILY_REPORT,
    async (job: Job<DailyReportJobData>) => {
      const { targetDate, accountId } = job.data
      logger.info(`일일 리포트 생성 시작: ${targetDate}`, { jobId: job.id })

      const jobLog = await prisma.jobLog.create({
        data: {
          jobType: 'daily_report',
          jobId: job.id ?? '',
          status: 'started',
          payload: { targetDate, accountId },
          startedAt: new Date(),
        },
      })

      try {
        // 오늘 + 전일 지표 수집
        const prevDate = new Date(targetDate)
        prevDate.setDate(prevDate.getDate() - 1)
        const prevDateStr = prevDate.toISOString().split('T')[0]

        const [todayMetrics, previousMetrics] = await Promise.all([
          collectDailyMetrics(targetDate, accountId),
          collectDailyMetrics(prevDateStr, accountId),
        ])

        const report = buildDailyReport(todayMetrics, previousMetrics, targetDate)

        // 텔레그램 알림 발송
        try {
          await notificationAdapter.send(report.notificationMessage)
        } catch (notifError) {
          logger.warn('일일 리포트 알림 발송 실패', { error: notifError })
        }

        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: {
            status: 'completed',
            result: {
              date: report.date,
              revenue: report.metrics.revenue,
              orders: report.metrics.orders,
              hasAnomaly: report.anomalyResult.hasAnomaly,
              anomalyCount: report.anomalyResult.anomalies.length,
            },
            completedAt: new Date(),
          },
        })

        logger.info(`일일 리포트 완료: ${targetDate}`, {
          hasAnomaly: report.anomalyResult.hasAnomaly,
        })

        return { success: true, report }
      } catch (error) {
        await prisma.jobLog.update({
          where: { id: jobLog.id },
          data: { status: 'failed', error: String(error), completedAt: new Date() },
        })
        throw error
      }
    },
    { connection: redisConnection, concurrency: 1 },
  )

  return worker
}

/**
 * 일일 리포트 큐에 작업 추가 (cron에서 호출)
 */
export async function enqueueDailyReport(
  queue: { add: (name: string, data: DailyReportJobData) => Promise<unknown> },
  accountId = 'default',
): Promise<void> {
  // 어제 날짜 기준 리포트
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const targetDate = yesterday.toISOString().split('T')[0]

  await queue.add('daily-report', { targetDate, accountId })
  logger.info(`일일 리포트 큐 추가: ${targetDate}`)
}
