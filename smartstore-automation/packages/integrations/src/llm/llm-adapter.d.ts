import { z } from 'zod';
export declare const LLMProviderSchema: any;
export type LLMProvider = z.infer<typeof LLMProviderSchema>;
export declare const LLMConfigSchema: any;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface LLMResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
export declare abstract class LLMAdapter {
    protected config: LLMConfig;
    constructor(config: LLMConfig);
    abstract generate(messages: LLMMessage[]): Promise<LLMResponse>;
    abstract generateStream(messages: LLMMessage[]): AsyncGenerator<string>;
}
export declare class OllamaAdapter extends LLMAdapter {
    private baseUrl;
    private model;
    constructor(config: LLMConfig);
    generate(messages: LLMMessage[]): Promise<LLMResponse>;
    generateStream(messages: LLMMessage[]): AsyncGenerator<string>;
}
export declare class OpenAIAdapter extends LLMAdapter {
    private apiKey;
    private model;
    constructor(config: LLMConfig);
    generate(messages: LLMMessage[]): Promise<LLMResponse>;
    generateStream(messages: LLMMessage[]): AsyncGenerator<string>;
}
export declare function createLLMAdapter(config: LLMConfig): LLMAdapter;
export declare function getLLMConfigFromEnv(): LLMConfig;
declare const _default: {
    createLLMAdapter: typeof createLLMAdapter;
    getLLMConfigFromEnv: typeof getLLMConfigFromEnv;
    OllamaAdapter: typeof OllamaAdapter;
    OpenAIAdapter: typeof OpenAIAdapter;
};
export default _default;
//# sourceMappingURL=llm-adapter.d.ts.map