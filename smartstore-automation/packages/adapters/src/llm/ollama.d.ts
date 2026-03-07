import type { LLMAdapter, LLMGenerateInput, LLMGenerateResult } from './interface';
export declare class OllamaAdapter implements LLMAdapter {
    private readonly baseUrl;
    private readonly model;
    constructor(baseUrl: string, model: string);
    generate(input: LLMGenerateInput): Promise<LLMGenerateResult>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=ollama.d.ts.map