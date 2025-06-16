import type { ModelConfig, Account } from './types.ts';

// 模型映射表
export const MODEL_MAPPING: Record<string, ModelConfig> = {
  "claude-3-7-sonnet-20250219": {
    model_id: "be71f37b-1487-49fa-a989-a9bb99c0b129",
    max_tokens: 64000
  },
  "claude-4-opus-20250514": {
    model_id: "bebc7dd5-a24d-4147-85b0-8f62902ea1a3",
    max_tokens: 32000
  },
  "claude-4-sonnet": {
    model_id: "884dde7c-8def-4365-b19a-57af2787ab84",
    max_tokens: 64000
  }
};

/**
 * 验证模型名称是否存在
 */
export function validateModel(modelName: string): [boolean, string | null] {
  if (!(modelName in MODEL_MAPPING)) {
    return [false, `模型 '${modelName}' 不存在。支持的模型: ${Object.keys(MODEL_MAPPING).join(', ')}`];
  }
  return [true, null];
}

/**
 * 获取账号余额信息
 */
export async function getAccountBalance(sessionId: string): Promise<[number, boolean]> {
  try {
    const headers = {
      "accept": "application/json",
      "accept-language": "zh-CN,zh;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/json",
      "pragma": "no-cache",
      "priority": "u=1, i",
      "referer": "https://app.freeplay.ai/settings/members",
      "sec-ch-ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      "cookie": `session=${sessionId}`
    };

    const response = await fetch("https://app.freeplay.ai/app_data/settings/billing", {
      method: "GET",
      headers
    });

    if (response.status === 200) {
      const data = await response.json();
      // 查找 Freeplay credits 的使用情况
      const featureUsage = data.feature_usage || [];
      for (const feature of featureUsage) {
        if (feature.feature_name === 'Freeplay credits') {
          const usageLimit = feature.usage_limit || 0;
          const usageValue = feature.usage_value || 0;
          const remainingBalance = usageLimit - usageValue;
          return [remainingBalance, true];
        }
      }
      return [0, false];
    } else {
      // 401表示账号被禁用或session过期，404表示资源不存在
      if (response.status === 401) {
        console.log(`获取余额失败，状态码: ${response.status} (账号可能被禁用或session过期)`);
      } else if (response.status === 404) {
        console.log(`获取余额失败，状态码: ${response.status} (资源不存在)`);
      } else {
        console.log(`获取余额失败，状态码: ${response.status}`);
      }
      return [0, false];
    }
  } catch (error) {
    console.log(`获取账号余额时出错: ${error}`);
    return [0, false];
  }
}

/**
 * 生成UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 生成聊天ID
 */
export function generateChatId(): string {
  return `chatcmpl-${generateUUID().replace(/-/g, '').substring(0, 29)}`;
}

/**
 * 解析SSE数据行
 */
export function parseSSELine(line: string): any | null {
  if (line.startsWith('data: ')) {
    try {
      return JSON.parse(line.substring(6));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 创建SSE数据行
 */
export function createSSELine(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * 创建错误响应
 */
export function createErrorResponse(message: string, type: string = "api_error", statusCode: number = 500): Response {
  return new Response(JSON.stringify({
    error: {
      message,
      type
    }
  }), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json"
    }
  });
} 