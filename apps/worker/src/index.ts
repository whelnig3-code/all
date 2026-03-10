// =============================================
// Worker 메인 엔트리 포인트
// - 모든 BullMQ 워커 시작
// - 스케줄러 설정 (주문 폴링, 가격 모니터링)
// =============================================

import { createLogger, config } from '@smartstore/shared'
import cron from 'node-cron'
import {
  registrationQueue,
  orderQueue,
  shippingNotificationQueue,
  priceMonitorQueue,
  contentGenerationQueue,
  refundQueue,
  talkTalkQueue,
  wholesaleWatcherQueue,
  blogPostingQueue,
  inventorySyncQueue,
  inventoryRecoveryQueue,
  orderApprovalQueue,
  wholesaleOrderQueue,
  trackingPollQueue,
  dailyReportQueue,
  reviewMonitorQueue,
} from './queues'
import { createRegistrationWorker, enqueuePendingProducts } from './jobs/registration.job'
import { createOrderWorker, pollAndEnqueueNewOrders } from './jobs/order.job'
import { createShippingWorker } from './jobs/shipping.job'
import { createPriceMonitorWorker, enqueueActiveProductsForPriceMonitor } from './jobs/price-monitor.job'
import { createContentWorker, enqueueProductsForContentGeneration } from './jobs/content.job'
import { createRefundWorker } from './jobs/refund.job'
import { createTalkTalkWorker } from './jobs/talktalk.job'
import { createWholesaleWatcherWorker } from './jobs/wholesale-watcher.job'
import { createBlogPostingWorker } from './jobs/blog-posting.job'
import { createInventorySyncWorker, pollAndSyncInventory } from './jobs/inventory-sync.job'
import { createInventoryRecoveryWorker } from './jobs/inventory-recovery.job'
import { createOrderApprovalWorker } from './jobs/order-approval.job'
import { createWholesaleOrderWorker } from './jobs/wholesale-order.job'
import { createTrackingPollWorker } from './jobs/tracking-poll.job'
import { createDailyReportWorker, enqueueDailyReport } from './jobs/daily-report.job'
import { createReviewMonitorWorker, enqueueReviewMonitorProducts } from './jobs/review-monitor.job'
import { cleanExpiredReservations } from '@smartstore/core'
import { startSettingsRefresh } from './settings-cache'

const logger = createLogger('worker-main')

async function main() {
  logger.info('스마트스토어 자동화 워커 시작', {
    env: config.system.nodeEnv,
  })

  // =============================
  // 1. 워커 시작
  // =============================
  const registrationWorker = createRegistrationWorker()
  const orderWorker = createOrderWorker()
  const shippingWorker = createShippingWorker()
  const priceMonitorWorker = createPriceMonitorWorker()
  const contentWorker = createContentWorker()
  const refundWorker = createRefundWorker()          // Phase 4: 환불/교환 자동 처리
  const talkTalkWorker = createTalkTalkWorker()      // Phase 4: 톡톡 자동 응답
  const wholesaleWatcherWorker = createWholesaleWatcherWorker()  // P2-A: 도매 원가 변동 감지
  const blogPostingWorker = createBlogPostingWorker()            // P3: 블로그 자동 포스팅
  const inventorySyncWorker = createInventorySyncWorker()        // 재고 동기화
  const inventoryRecoveryWorker = createInventoryRecoveryWorker() // 재고 복구
  const orderApprovalWorker = createOrderApprovalWorker()        // 주문 승인 타임아웃
  const wholesaleOrderWorker = createWholesaleOrderWorker()      // 도매처 자동 주문
  const trackingPollWorker = createTrackingPollWorker()          // 운송장 폴링
  const dailyReportWorker = createDailyReportWorker()            // Phase C: 일일 리포트
  const reviewMonitorWorker = createReviewMonitorWorker()        // Phase C: 리뷰 모니터링

  logger.info('모든 워커 시작 완료')

  // Kill Switch 설정 캐시 시작 (60초마다 DB에서 갱신)
  startSettingsRefresh()
  logger.info('시스템 설정 캐시 초기화 완료')

  // =============================
  // 2. 초기 작업 큐 채우기
  // =============================

  const [pendingCount, newOrderCount, pendingContentCount, syncCount] = await Promise.all([
    enqueuePendingProducts(registrationQueue),
    pollAndEnqueueNewOrders(orderQueue),
    enqueueProductsForContentGeneration(contentGenerationQueue),
    pollAndSyncInventory(inventorySyncQueue),
  ])
  logger.info(`초기 큐 채우기 완료`, {
    등록대기: pendingCount,
    신규주문: newOrderCount,
    콘텐츠생성: pendingContentCount,
    재고동기화: syncCount,
  })

  // =============================
  // 3. 스케줄러 (node-cron 기반 주기적 작업)
  // =============================

  // 주문 폴링: 매 5분
  const orderPollTask = cron.schedule('*/5 * * * *', async () => {
    try {
      await pollAndEnqueueNewOrders(orderQueue)
    } catch (error) {
      logger.error('주문 폴링 스케줄 실패', error)
    }
  })
  logger.info('주문 폴링 스케줄러: */5 * * * * (매 5분)')

  // 가격 모니터링: 매시 정각
  const priceMonitorTask = cron.schedule('0 * * * *', async () => {
    try {
      await enqueueActiveProductsForPriceMonitor(priceMonitorQueue)
    } catch (error) {
      logger.error('가격 모니터링 스케줄 실패', error)
    }
  })
  logger.info('가격 모니터링 스케줄러: 0 * * * * (매시 정각)')

  // 콘텐츠 생성: 매 30분
  const contentGenTask = cron.schedule('*/30 * * * *', async () => {
    try {
      const count = await enqueueProductsForContentGeneration(contentGenerationQueue)
      if (count > 0) {
        logger.info(`콘텐츠 생성 스케줄 실행: ${count}건 큐에 추가`)
      }
    } catch (error) {
      logger.error('콘텐츠 생성 스케줄 실패', error)
    }
  })
  logger.info('콘텐츠 생성 스케줄러: */30 * * * * (매 30분)')

  // 재고 동기화: 매 10분
  const inventorySyncTask = cron.schedule('*/10 * * * *', async () => {
    try {
      const count = await pollAndSyncInventory(inventorySyncQueue)
      if (count > 0) {
        logger.info(`재고 동기화 스케줄 실행: ${count}건 큐에 추가`)
      }
    } catch (error) {
      logger.error('재고 동기화 스케줄 실패', error)
    }
  })
  logger.info('재고 동기화 스케줄러: */10 * * * * (매 10분)')

  // 만료된 예약 정리: 매 1분 (크래시 복구 안전망)
  const reservationCleanupTask = cron.schedule('* * * * *', async () => {
    try {
      const count = await cleanExpiredReservations()
      if (count > 0) {
        logger.info(`만료 예약 정리: ${count}건`)
      }
    } catch (error) {
      logger.error('만료 예약 정리 실패', error)
    }
  })
  logger.info('만료 예약 정리 스케줄러: * * * * * (매 1분)')

  // 일일 리포트: 매일 오전 8시 (전일 데이터 집계)
  const dailyReportTask = cron.schedule('0 8 * * *', async () => {
    try {
      await enqueueDailyReport(dailyReportQueue)
    } catch (error) {
      logger.error('일일 리포트 스케줄 실패', error)
    }
  })
  logger.info('일일 리포트 스케줄러: 0 8 * * * (매일 오전 8시)')

  // 리뷰 모니터링: 매일 오전 10시
  const reviewMonitorTask = cron.schedule('0 10 * * *', async () => {
    try {
      const count = await enqueueReviewMonitorProducts(reviewMonitorQueue)
      if (count > 0) {
        logger.info(`리뷰 모니터링 스케줄 실행: ${count}건 큐에 추가`)
      }
    } catch (error) {
      logger.error('리뷰 모니터링 스케줄 실패', error)
    }
  })
  logger.info('리뷰 모니터링 스케줄러: 0 10 * * * (매일 오전 10시)')

  // =============================
  // 4. 종료 핸들러
  // =============================
  async function shutdown() {
    logger.info('워커 종료 중...')

    // cron 스케줄러 정지
    orderPollTask.stop()
    priceMonitorTask.stop()
    contentGenTask.stop()
    inventorySyncTask.stop()
    reservationCleanupTask.stop()
    dailyReportTask.stop()
    reviewMonitorTask.stop()

    await Promise.all([
      registrationWorker.close(),
      orderWorker.close(),
      shippingWorker.close(),
      priceMonitorWorker.close(),
      contentWorker.close(),
      refundWorker.close(),            // Phase 4
      talkTalkWorker.close(),          // Phase 4
      wholesaleWatcherWorker.close(),  // P2-A
      blogPostingWorker.close(),       // P3
      inventorySyncWorker.close(),     // 재고 동기화
      inventoryRecoveryWorker.close(), // 재고 복구
      orderApprovalWorker.close(),     // 주문 승인 타임아웃
      wholesaleOrderWorker.close(),    // 도매처 자동 주문
      trackingPollWorker.close(),      // 운송장 폴링
      dailyReportWorker.close(),       // Phase C: 일일 리포트
      reviewMonitorWorker.close(),     // Phase C: 리뷰 모니터링
    ])

    await Promise.all([
      registrationQueue.close(),
      orderQueue.close(),
      shippingNotificationQueue.close(),
      priceMonitorQueue.close(),
      contentGenerationQueue.close(),
      refundQueue.close(),              // Phase 4
      talkTalkQueue.close(),            // Phase 4
      wholesaleWatcherQueue.close(),    // P2-A
      blogPostingQueue.close(),         // P3
      inventorySyncQueue.close(),       // 재고 동기화
      inventoryRecoveryQueue.close(),   // 재고 복구
      orderApprovalQueue.close(),      // 주문 승인 타임아웃
      wholesaleOrderQueue.close(),     // 도매처 자동 주문
      trackingPollQueue.close(),      // 운송장 폴링
      dailyReportQueue.close(),       // Phase C: 일일 리포트
      reviewMonitorQueue.close(),     // Phase C: 리뷰 모니터링
    ])

    logger.info('워커 종료 완료')
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  logger.info('워커 준비 완료. Phase 2~4 자동화 실행 중')
}

main().catch((error) => {
  logger.error('워커 시작 실패', error)
  process.exit(1)
})
