/** 전체 설정 객체 */
export declare const config: {
    database: {
        url: string;
    };
    naver: {
        clientId: string;
        clientSecret: string;
        shopId: string;
        apiBaseUrl: string;
    };
    translator: {
        adapter: "google-free" | "deepl";
        deeplApiKey: string;
    };
    notification: {
        adapter: "telegram" | "sms";
        telegram: {
            botToken: string;
            chatId: string;
        };
        sms: {
            apiKey: string;
            fromNumber: string;
        };
    };
    llm: {
        adapter: "ollama" | "openai";
        ollamaBaseUrl: string;
        ollamaModel: string;
        openaiApiKey: string;
        openaiModel: string;
    };
    redis: {
        host: string;
        port: number;
        password: string;
    };
    sourcing: {
        aliexpressEnabled: boolean;
        taobaoEnabled: boolean;
    };
    exchangeRate: {
        apiKey: string;
    };
    priceMonitor: {
        intervalMs: number;
    };
    system: {
        nodeEnv: "development" | "production" | "test";
        logLevel: "debug" | "info" | "warn" | "error";
        port: number;
    };
};
export type Config = typeof config;
//# sourceMappingURL=config.d.ts.map