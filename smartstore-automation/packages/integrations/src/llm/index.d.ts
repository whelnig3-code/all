import type { LLMAdapter, LLMResponse } from './types';
export declare class OllamaAdapter implements LLMAdapter {
    private baseUrl;
    private model;
    constructor(baseUrl?: string, model?: string);
    generateText(prompt: string, options?: {
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    }): Promise<LLMResponse>;
    generateProductDescription(product: {
        name: string;
        category: string;
        features?: string[];
        specifications?: Record<string, string>;
        originalPrice: number;
        sellingPrice: number;
    }): Promise<string>;
    generateBlogPost(product: {
        name: string;
        description: string;
        keywords?: string[];
    }): Promise<string>;
    generateCustomerResponse(inquiry: {
        question: string;
        productName?: string;
        context?: string;
    }): Promise<string>;
}
export declare class OpenAIAdapter implements LLMAdapter {
    private apiKey;
    private model;
    constructor(apiKey: string, model?: string);
    generateText(prompt: string, options?: {
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
    }): Promise<LLMResponse>;
    generateProductDescription(product: {
        name: string;
        category: string;
        features?: string[];
        specifications?: Record<string, string>;
        originalPrice: number;
        sellingPrice: number;
    }): Promise<string>;
    generateBlogPost(product: {
        name: string;
        description: string;
        keywords?: string[];
    }): Promise<string>;
    generateCustomerResponse(inquiry: {
        question: string;
        productName?: string;
        context?: string;
    }): Promise<string>;
}
export declare function createLLMAdapter(adapter: string): LLMAdapter;
export declare function getLLM(): LLMAdapter;
//# sourceMappingURL=index.d.ts.map