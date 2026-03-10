import type { LLMAdapter, LLMResponse } from './types';

// Ollama LLM 어댑터 구현
export class OllamaAdapter implements LLMAdapter {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'llama2') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generateText(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }): Promise<LLMResponse> {
    try {
      // Ollama API 호출
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt: options?.systemPrompt
            ? `${options.systemPrompt}\n\n${prompt}`
            : prompt,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1000,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data: any = await response.json();

      return {
        text: data.response,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        }
      };
    } catch (error) {
      console.error('Ollama generation error:', error);
      throw error;
    }
  }

  async generateProductDescription(product: {
    name: string;
    category: string;
    features?: string[];
    specifications?: Record<string, string>;
    originalPrice: number;
    sellingPrice: number;
  }): Promise<string> {
    // 상품 설명 생성을 위한 프롬프트 구성
    const prompt = `다음 정보를 바탕으로 매력적인 상품 설명을 작성해주세요:

상품명: ${product.name}
카테고리: ${product.category}
${product.features ? `특징:\n${product.features.map(f => `- ${f}`).join('\n')}` : ''}
${product.specifications ? `사양:\n${Object.entries(product.specifications).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}
판매가: ${product.sellingPrice.toLocaleString()}원

SEO에 최적화되고 구매욕구를 자극하는 설명을 작성해주세요.`;

    const response = await this.generateText(prompt, {
      temperature: 0.8,
      maxTokens: 500,
      systemPrompt: '당신은 네이버 스마트스토어 상품 설명 전문가입니다.'
    });

    return response.text;
  }

  async generateBlogPost(product: {
    name: string;
    description: string;
    keywords?: string[];
  }): Promise<string> {
    // 블로그 포스트 생성
    const prompt = `다음 상품에 대한 네이버 블로그 포스트를 작성해주세요:

상품명: ${product.name}
설명: ${product.description}
${product.keywords ? `키워드: ${product.keywords.join(', ')}` : ''}

자연스럽고 정보성 있는 블로그 글을 작성해주세요.`;

    const response = await this.generateText(prompt, {
      temperature: 0.9,
      maxTokens: 1500,
      systemPrompt: '당신은 네이버 블로그 컨텐츠 전문가입니다.'
    });

    return response.text;
  }

  async generateCustomerResponse(inquiry: {
    question: string;
    productName?: string;
    context?: string;
  }): Promise<string> {
    // 고객 문의 자동 응답 생성
    const prompt = `고객 문의: ${inquiry.question}
${inquiry.productName ? `상품명: ${inquiry.productName}` : ''}
${inquiry.context ? `추가 정보: ${inquiry.context}` : ''}

친절하고 도움이 되는 답변을 작성해주세요.`;

    const response = await this.generateText(prompt, {
      temperature: 0.6,
      maxTokens: 300,
      systemPrompt: '당신은 친절한 스마트스토어 고객 상담사입니다.'
    });

    return response.text;
  }
}

// OpenAI 어댑터 (유료 전환용)
export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-3.5-turbo') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }): Promise<LLMResponse> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            ...(options?.systemPrompt ? [{
              role: 'system',
              content: options.systemPrompt
            }] : []),
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1000
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data: any = await response.json();

      return {
        text: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        }
      };
    } catch (error) {
      console.error('OpenAI generation error:', error);
      throw error;
    }
  }

  async generateProductDescription(product: {
    name: string;
    category: string;
    features?: string[];
    specifications?: Record<string, string>;
    originalPrice: number;
    sellingPrice: number;
  }): Promise<string> {
    const prompt = `Create an engaging product description for:

Product: ${product.name}
Category: ${product.category}
${product.features ? `Features:\n${product.features.map(f => `- ${f}`).join('\n')}` : ''}
${product.specifications ? `Specifications:\n${Object.entries(product.specifications).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}
Price: ₩${product.sellingPrice.toLocaleString()}

Write in Korean, optimized for Naver shopping SEO.`;

    const response = await this.generateText(prompt, {
      temperature: 0.8,
      maxTokens: 500,
      systemPrompt: 'You are an expert e-commerce copywriter specializing in Korean market.'
    });

    return response.text;
  }

  async generateBlogPost(product: {
    name: string;
    description: string;
    keywords?: string[];
  }): Promise<string> {
    const prompt = `Write a Naver blog post about:

Product: ${product.name}
Description: ${product.description}
${product.keywords ? `Keywords: ${product.keywords.join(', ')}` : ''}

Create natural, informative content in Korean.`;

    const response = await this.generateText(prompt, {
      temperature: 0.9,
      maxTokens: 1500,
      systemPrompt: 'You are a professional Korean blog content creator.'
    });

    return response.text;
  }

  async generateCustomerResponse(inquiry: {
    question: string;
    productName?: string;
    context?: string;
  }): Promise<string> {
    const prompt = `Customer inquiry: ${inquiry.question}
${inquiry.productName ? `Product: ${inquiry.productName}` : ''}
${inquiry.context ? `Context: ${inquiry.context}` : ''}

Provide a helpful response in Korean.`;

    const response = await this.generateText(prompt, {
      temperature: 0.6,
      maxTokens: 300,
      systemPrompt: 'You are a friendly Korean customer service representative.'
    });

    return response.text;
  }
}

// 팩토리 함수
export function createLLMAdapter(adapter: string): LLMAdapter {
  switch (adapter) {
    case 'ollama':
      return new OllamaAdapter(
        process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        process.env.OLLAMA_MODEL || 'llama2'
      );
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for OpenAI adapter');
      }
      return new OpenAIAdapter(
        process.env.OPENAI_API_KEY,
        process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
      );
    default:
      throw new Error(`Unknown LLM adapter: ${adapter}`);
  }
}

// 싱글톤 인스턴스
let llmInstance: LLMAdapter | null = null;

export function getLLM(): LLMAdapter {
  if (!llmInstance) {
    const adapter = process.env.LLM_ADAPTER || 'ollama';
    llmInstance = createLLMAdapter(adapter);
  }
  return llmInstance;
}