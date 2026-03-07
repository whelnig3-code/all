import type { LLMAdapter, LLMGenerateInput, LLMGenerateResult } from './interface';
export declare class OpenAIAdapter implements LLMAdapter {
    private readonly apiKey;
    private readonly model;
    constructor(apiKey: string, model: string);
    generate(input: LLMGenerateInput): Promise<LLMGenerateResult>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=openai.d.ts.map