import type { Notification } from '@smartstore/shared';
import type { NotificationAdapter } from './interface';
/** 텔레그램 알림 어댑터 */
export declare class TelegramNotificationAdapter implements NotificationAdapter {
    private readonly botToken;
    private readonly chatId;
    private readonly apiUrl;
    constructor(botToken?: string, chatId?: string);
    send(notification: Notification): Promise<boolean>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=telegram.d.ts.map