// 账号信息接口
export interface Account {
  email: string;
  password: string;
  session_id: string;
  project_id: string;
  balance: number;
}

// 模型配置接口
export interface ModelConfig {
  model_id: string;
  max_tokens: number;
}

// OpenAI消息接口
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// OpenAI请求接口
export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

// FreePlay API参数接口
export interface FreePlayParam {
  initial_value?: number;
  is_advanced: boolean;
  name: string;
  nested_fields?: null;
  range?: null;
  str_options?: null;
  tooltipText?: null;
  type: 'integer' | 'float';
  value: number;
}

// FreePlay请求数据接口
export interface FreePlayRequestData {
  messages: ChatMessage[];
  params: FreePlayParam[];
  model_id: string;
  variables: Record<string, unknown>;
  history: null;
  asset_references: Record<string, unknown>;
}

// OpenAI响应接口
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// 流式响应块接口
export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

// API错误响应接口
export interface APIError {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

// 账号状态响应接口
export interface AccountStatusResponse {
  total_accounts: number;
  available_accounts: number;
  disabled_accounts: number;
  low_balance_accounts: number;
  total_balance: string;
  accounts: Array<{
    email: string;
    balance: string;
    status: string;
    project_id: string;
  }>;
} 