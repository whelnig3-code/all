// =============================================
// 네이버 톡톡 자동 응답 워커 (Phase 4.1)
//
// 비유: 고객센터 안내원 — 고객 메시지를 분석하고,
// 매뉴얼(템플릿)에 맞는 답변이 있으면 자동 응답.
// 없으면 "수동 대기"로 기록하고 알림.
//
// 처리 흐름:
//   1. Kill Switch / Credential Gate
//   2. analyzeInquiry — 카테고리/감정/긴급도 분석
//   3. handleWebhook — 자동 응답 템플릿 매칭
//   4. executeAutoReply — 매칭 시 응답 발송
//   5. DB 대화 로그 저장
//   6. 긴급 + 부정 감정 → 알림 발송
// =============================================

import { Worker, Job } from 'bullmq'
import { config, createLogger } from '@smartstore/shared'
import { TalkTalkClient } from '@smartstore/integrations'
import { notificationAdapter } from '@smartstore/adapters'
import { prisma } from '@smartstore/db'
import { QUEUE_NAMES, redisConnection, type TalkTalkJobData } from '../queues'
import { getSetting } from '../settings-cache'
import { checkCredentialGate, gateSkipResult } from '../credential-gate'

const logger = createLogger('talktalk-job')

/** 분석 실패 시 사용하는 기본값 */
const DEFAULT_ANALYSIS: {
  category: 'ORDER' | 'PRODUCT' | 'DELIVERY' | 'REFUND' | 'OTHER'
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  suggestedActions: string[]
  entities: Record<string, string | undefined>
} = {
  category: 'OTHER',
  sentiment: 'NEUTRAL',
  urgency: 'MEDIUM',
  suggestedActions: [],
  entities: {},
}

/**
 * 톡톡 자동 응답 워커
 */
export function createTalkTalkWorker(): Worker {
  const worker = new Worker<TalkTalkJobData>(
    QUEUE_NAMES.TALKTALK_AUTOMATION,
    async (job: Job<TalkTalkJobData>) => {
      // 1. Kill Switch
      if (getSetting('AUTO_TALKTALK_ENABLED') !== 'true') {
        logger.warn('AUTO_TALKTALK_DISABLED')
        return { skipped: true, reason: 'kill-switch' }
      }

      // 2. Credential Gate
      const gate = await checkCredentialGate(['naver_talktalk'])
      if (!gate.passed) return gateSkipResult(gate.missing)

      const { channelId, customerId, message, messageType } = job.data

      logger.info('톡톡 메시지 수신', {
        channelId,
        customerId,
        messageType,
        messageLength: message.length,
        jobId: job.id,
      })

      // TalkTalkClient 인스턴스 생성
      const client = new TalkTalkClient({
        clientId: config.naver.clientId,
        clientSecret: config.naver.clientSecret,
        storeId: config.naver.shopId,
      })

      // 3. 메시지 분석 (실패 시 기본값 사용)
      let analysis = DEFAULT_ANALYSIS
      try {
        analysis = await client.analyzeInquiry(message)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.warn('메시지 분석 실패 — 기본값 사용', { error: msg })
      }

      // 4. 자동 응답 템플릿 매칭
      const webhookResult = await client.handleWebhook({
        eventType: 'MESSAGE_RECEIVED',
        storeId: config.naver.shopId,
        channelId,
        customerId,
        message,
        timestamp: new Date(),
      })

      // 5. 매칭 성공 → 자동 응답 발송
      let autoReplied = false
      let autoReplyMessage: string | undefined
      let matchedTemplateId: string | undefined

      if (webhookResult.shouldAutoReply && webhookResult.suggestedReply) {
        try {
          await client.executeAutoReply({
            channelId,
            customerId,
            customMessage: webhookResult.suggestedReply,
          })
          autoReplied = true
          autoReplyMessage = webhookResult.suggestedReply
          matchedTemplateId = webhookResult.matchedTemplate?.templateId
          logger.info('자동 응답 발송 완료', { channelId, customerId, matchedTemplateId })
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          logger.warn('자동 응답 발송 실패', { channelId, customerId, error: msg })
        }
      }

      // 6. DB 대화 로그 저장
      await prisma.talkTalkConversation.create({
        data: {
          channelId,
          customerId,
          message,
          messageType,
          category: analysis.category,
          sentiment: analysis.sentiment,
          urgency: analysis.urgency,
          autoReplySent: autoReplied,
          autoReplyMessage,
          matchedTemplateId,
          jobId: job.id ?? '',
        },
      })

      // 7. 긴급 + 부정 감정 → 알림
      if (analysis.urgency === 'HIGH' && analysis.sentiment === 'NEGATIVE') {
        await notificationAdapter.send({
          type: 'talktalk_urgent',
          title: '긴급 고객 문의',
          message: [
            `고객: ${customerId}`,
            `카테고리: ${analysis.category}`,
            `메시지: ${message.slice(0, 100)}`,
            autoReplied ? '자동 응답 완료' : '수동 응답 필요',
          ].join('\n'),
          data: { channelId, customerId, category: analysis.category },
        })
      }

      return {
        processed: true,
        autoReplied,
        category: analysis.category,
        ...(matchedTemplateId ? { templateId: matchedTemplateId } : {}),
      }
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  )

  return worker
}
