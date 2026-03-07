import { BaseApiClient } from '../base';
import type { ApiResponse } from '../types';
interface TalkTalkMessage {
    messageId: string;
    channelId: string;
    storeId: string;
    customerId: string;
    customerName: string;
    message: string;
    messageType: 'TEXT' | 'IMAGE' | 'FILE';
    timestamp: Date;
    isRead: boolean;
}
interface TalkTalkCustomer {
    customerId: string;
    name: string;
    phone?: string;
    email?: string;
    lastMessageTime: Date;
    unreadCount: number;
}
interface SendMessageRequest {
    channelId: string;
    customerId: string;
    message: string;
    messageType?: 'TEXT' | 'IMAGE' | 'FILE';
    attachments?: Array<{
        url: string;
        name: string;
        size: number;
    }>;
}
interface AutoReplyTemplate {
    templateId: string;
    name: string;
    trigger: string;
    message: string;
    keywords: string[];
    priority: number;
    enabled: boolean;
}
interface TalkTalkWebhookPayload {
    eventType: 'MESSAGE_RECEIVED' | 'MESSAGE_READ' | 'CUSTOMER_JOINED';
    storeId: string;
    channelId: string;
    customerId: string;
    message?: string;
    timestamp: Date;
}
export declare class TalkTalkClient extends BaseApiClient {
    private baseUrl;
    constructor(config: {
        clientId: string;
        clientSecret: string;
        storeId: string;
    });
    /**
     * 고객 메시지 목록 조회
     */
    getMessages(params: {
        customerId?: string;
        channelId?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    }): Promise<ApiResponse<TalkTalkMessage[]>>;
    /**
     * 고객 목록 조회
     */
    getCustomers(params: {
        channelId?: string;
        hasUnread?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<ApiResponse<TalkTalkCustomer[]>>;
    /**
     * 메시지 전송
     */
    sendMessage(request: SendMessageRequest): Promise<ApiResponse<TalkTalkMessage>>;
    /**
     * 자동 응답 템플릿 목록 조회
     */
    getAutoReplyTemplates(): Promise<ApiResponse<AutoReplyTemplate[]>>;
    /**
     * 자동 응답 템플릿 생성
     */
    createAutoReplyTemplate(template: Omit<AutoReplyTemplate, 'templateId'>): Promise<ApiResponse<AutoReplyTemplate>>;
    /**
     * 자동 응답 템플릿 업데이트
     */
    updateAutoReplyTemplate(templateId: string, template: Partial<AutoReplyTemplate>): Promise<ApiResponse<AutoReplyTemplate>>;
    /**
     * 메시지 읽음 처리
     */
    markAsRead(messageIds: string[]): Promise<ApiResponse<void>>;
    /**
     * 웹훅 이벤트 처리
     */
    handleWebhook(payload: TalkTalkWebhookPayload): Promise<{
        shouldAutoReply: boolean;
        suggestedReply?: string;
        matchedTemplate?: AutoReplyTemplate;
    }>;
    /**
     * 자동 응답 실행
     */
    executeAutoReply(params: {
        channelId: string;
        customerId: string;
        templateId?: string;
        customMessage?: string;
    }): Promise<ApiResponse<TalkTalkMessage>>;
    /**
     * 고객 문의 분석 (AI 기반)
     */
    analyzeInquiry(message: string): Promise<{
        category: 'ORDER' | 'PRODUCT' | 'DELIVERY' | 'REFUND' | 'OTHER';
        sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
        urgency: 'HIGH' | 'MEDIUM' | 'LOW';
        suggestedActions: string[];
        entities: {
            orderNumber?: string;
            productId?: string;
            trackingNumber?: string;
        };
    }>;
    /**
     * 대화 이력 요약
     */
    summarizeConversation(customerId: string, limit?: number): Promise<{
        totalMessages: number;
        firstContactDate: Date;
        lastContactDate: Date;
        mainTopics: string[];
        resolvedIssues: number;
        pendingIssues: number;
    }>;
}
export type { TalkTalkMessage, TalkTalkCustomer, SendMessageRequest, AutoReplyTemplate, TalkTalkWebhookPayload };
//# sourceMappingURL=talktalk.d.ts.map