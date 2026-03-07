/** 네임스페이스별 로거 생성 */
export declare function createLogger(namespace: string): {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, error?: unknown): void;
};
export type Logger = ReturnType<typeof createLogger>;
//# sourceMappingURL=logger.d.ts.map