import type { NotificationAdapter } from './interface';
/**
 * 환경변수 NOTIFICATION_ADAPTER에 따라 어댑터 선택
 * - telegram (기본): 무료
 * - sms: 유료 (SOLAPI 등)
 */
export declare function createNotificationAdapter(): NotificationAdapter;
export declare const notificationAdapter: NotificationAdapter;
//# sourceMappingURL=factory.d.ts.map