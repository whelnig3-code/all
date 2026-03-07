export interface LLMAdapter {
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
export interface LLMResponse {
    text: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
export interface ContentGenerationOptions {
    temperature?: number;
    maxTokens?: number;
    language?: 'ko' | 'en';
    style?: 'formal' | 'casual' | 'marketing';
}
export interface ProductContent {
    title: string;
    description: string;
    features: string[];
    seoKeywords: string[];
    hashTags: string[];
}
//# sourceMappingURL=types.d.ts.map