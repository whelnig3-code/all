import { z } from 'zod';
import axios from 'axios';

// LLM 어댑터 타입 정의
export const LLMProviderSchema = z.enum(['ollama', 'openai']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const LLMConfigSchema = z.object({
  provider: LLMProviderSchema,
  ollamaConfig: z.object({
    baseUrl: z.string().url().default('http://localhost:11434'),
    model: z.string().default('llama3.2'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().default(2000),
  }).optional(),
  openaiConfig: z.object({
    apiKey: z.string(),
    model: z.string().default('gpt-4o-mini'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().default(2000),
  }).optional(),
});

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

// LLM 어댑터 추상 클래스
export abstract class LLMAdapter {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = LLMConfigSchema.parse(config);
  }

  abstract generate(messages: LLMMessage[]): Promise<LLMResponse>;
  abstract generateStream(messages: LLMMessage[]): AsyncGenerator<string>;
}

// Ollama 어댑터 구현
export class OllamaAdapter extends LLMAdapter {
  private baseUrl: string;
  private model: string;

  constructor(config: LLMConfig) {
    super(config);
    if (!config.ollamaConfig) {
      throw new Error('Ollama 설정이 필요합니다');
    }
    this.baseUrl = config.ollamaConfig.baseUrl;
    this.model = config.ollamaConfig.model;
  }

  async generate(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      // Ollama API로 메시지 전송
      const response = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: this.model,
          messages,
          temperature: this.config.ollamaConfig?.temperature || 0.7,
          options: {
            num_predict: this.config.ollamaConfig?.maxTokens || 2000,
          },
          stream: false,
        }
      );

      return {
        content: response.data.message.content,
        usage: {
          promptTokens: response.data.prompt_eval_count || 0,
          completionTokens: response.data.eval_count || 0,
          totalTokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0),
        },
      };
    } catch (error) {
      console.error('Ollama 생성 실패:', error);
      throw new Error(`Ollama 요청 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  async *generateStream(messages: LLMMessage[]): AsyncGenerator<string> {
    try {
      // Ollama 스트리밍 API 호출
      const response = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: this.model,
          messages,
          temperature: this.config.ollamaConfig?.temperature || 0.7,
          options: {
            num_predict: this.config.ollamaConfig?.maxTokens || 2000,
          },
          stream: true,
        },
        {
          responseType: 'stream',
        }
      );

      // 스트림 데이터 처리
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              yield json.message.content;
            }
          } catch {
            // JSON 파싱 실패 시 무시
          }
        }
      }
    } catch (error) {
      console.error('Ollama 스트리밍 실패:', error);
      throw new Error(`Ollama 스트리밍 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }
}

// OpenAI 어댑터 구현
export class OpenAIAdapter extends LLMAdapter {
  private apiKey: string;
  private model: string;

  constructor(config: LLMConfig) {
    super(config);
    if (!config.openaiConfig?.apiKey) {
      throw new Error('OpenAI API 키가 필요합니다');
    }
    this.apiKey = config.openaiConfig.apiKey;
    this.model = config.openaiConfig.model || 'gpt-4o-mini';
  }

  async generate(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      // OpenAI API 호출
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages,
          temperature: this.config.openaiConfig?.temperature || 0.7,
          max_tokens: this.config.openaiConfig?.maxTokens || 2000,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        usage: {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens,
        },
      };
    } catch (error) {
      console.error('OpenAI 생성 실패:', error);
      throw new Error(`OpenAI 요청 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  async *generateStream(messages: LLMMessage[]): AsyncGenerator<string> {
    try {
      // OpenAI 스트리밍 API 호출
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages,
          temperature: this.config.openaiConfig?.temperature || 0.7,
          max_tokens: this.config.openaiConfig?.maxTokens || 2000,
          stream: true,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        }
      );

      // SSE 스트림 데이터 처리
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch {
              // JSON 파싱 실패 시 무시
            }
          }
        }
      }
    } catch (error) {
      console.error('OpenAI 스트리밍 실패:', error);
      throw new Error(`OpenAI 스트리밍 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }
}

// 팩토리 함수로 어댑터 생성
export function createLLMAdapter(config: LLMConfig): LLMAdapter {
  switch (config.provider) {
    case 'ollama':
      return new OllamaAdapter(config);
    case 'openai':
      return new OpenAIAdapter(config);
    default:
      throw new Error(`지원하지 않는 LLM 제공자: ${config.provider}`);
  }
}

// 환경변수에서 설정 로드
export function getLLMConfigFromEnv(): LLMConfig {
  const provider = (process.env.LLM_ADAPTER || 'ollama') as LLMProvider;

  const config: LLMConfig = {
    provider,
  };

  if (provider === 'ollama') {
    config.ollamaConfig = {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2000', 10),
    };
  } else if (provider === 'openai') {
    config.openaiConfig = {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2000', 10),
    };
  }

  return config;
}

// 기본 내보내기
export default {
  createLLMAdapter,
  getLLMConfigFromEnv,
  OllamaAdapter,
  OpenAIAdapter,
};