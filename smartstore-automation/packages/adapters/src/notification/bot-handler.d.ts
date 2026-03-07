/**
 * 텍스트 커맨드를 처리하고 응답 메시지 반환
 * 허용되지 않은 chat_id → 빈 문자열 반환 (응답 생략)
 */
export declare function handleBotCommand(text: string, chatId: string | number): Promise<string>;
/**
 * Telegram Bot API long-polling 시작
 * - getUpdates API로 메시지를 실시간 수신
 * - 오류 발생 시 5초 대기 후 재시도 (서버 종료 방지)
 */
export declare function startBotPolling(): Promise<void>;
/** polling 중단 (테스트 / 서버 종료 시 호출) */
export declare function stopBotPolling(): void;
/**
 * Fallback 임계치 초과 알림
 * @param count 연속 Fallback 발생 횟수
 */
export declare function alertFallbackThreshold(count: number): Promise<void>;
/**
 * 워커 크래시 알림
 * @param error 크래시 원인 오류
 */
export declare function alertWorkerCrash(error: Error): Promise<void>;
/**
 * DB 연결 실패 알림
 * @param error DB 연결 오류
 */
export declare function alertDbFailure(error: Error): Promise<void>;
//# sourceMappingURL=bot-handler.d.ts.map