/**
 * Deno Deploy 专用启动文件
 * 这个文件专门为 Deno Deploy 环境优化
 */

import type { ChatCompletionRequest, AccountStatusResponse } from './types.ts';
import { MODEL_MAPPING, validateModel, createErrorResponse } from './utils.ts';
import { AccountPool } from './account-pool.ts';
import { generateOpenAIStreamResponse, generateOpenAINonStreamResponse } from './freeplay-api.ts';
import { ConfigManager } from './config-manager.ts';

// 初始化配置管理器和账号池
const configManager = new ConfigManager();
const accountPool = new AccountPool(configManager);

// 在模块加载时初始化账号池
await accountPool.loadAccounts();
console.log(`[DEPLOY] 已加载 ${accountPool.getAccounts().length} 个账号`);

/**
 * 主请求处理函数
 */
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  console.log(`[DEPLOY] ${method} ${pathname}`);

  // 设置CORS头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // 处理OPTIONS请求
  if (method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // 路由分发
    switch (pathname) {
      case '/v1/chat/completions':
        if (method === 'POST') {
          return await handleChatCompletions(request, corsHeaders);
        }
        break;

      case '/v1/models':
        if (method === 'GET') {
          return handleListModels(corsHeaders);
        }
        break;

      case '/accounts/status':
        if (method === 'GET') {
          return handleAccountsStatus(corsHeaders);
        }
        break;

      case '/test':
        if (method === 'GET') {
          return handleTest(corsHeaders);
        }
        break;

      case '/':
        if (method === 'GET') {
          return handleRoot(corsHeaders);
        }
        break;

      default:
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error(`[DEPLOY] 请求处理错误: ${error}`);
    return createErrorResponse(`Internal server error: ${error}`, "internal_error", 500);
  }
}

/**
 * 处理聊天完成请求
 */
async function handleChatCompletions(request: Request, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const data: ChatCompletionRequest = await request.json();
    const messages = data.messages || [];
    const stream = data.stream || false;
    const model = data.model || 'claude-3-7-sonnet-20250219';

    console.log(`[DEPLOY] 聊天请求 - 模型: ${model}, 流式: ${stream}, 消息数: ${messages.length}`);

    // 验证模型
    const [isValid, errorMsg] = validateModel(model);
    if (!isValid) {
      return new Response(JSON.stringify({
        error: {
          message: errorMsg,
          type: "invalid_request_error",
          param: "model",
          code: "model_not_found"
        }
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    if (stream) {
      console.log(`[DEPLOY] 处理流式请求`);
      // 流式响应
      const responseStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          console.log(`[DEPLOY] 开始流式响应控制器`);
          
          try {
            let chunkCount = 0;
            for await (const chunk of generateOpenAIStreamResponse(accountPool, messages, model)) {
              chunkCount++;
              console.log(`[DEPLOY] 发送流式数据块 ${chunkCount}: ${chunk.length} 字符`);
              controller.enqueue(encoder.encode(chunk));
            }
            console.log(`[DEPLOY] 流式响应完成，共发送 ${chunkCount} 个数据块`);
          } catch (error) {
            console.error(`[DEPLOY] 流式响应错误: ${error}`);
            const errorChunk = `data: ${JSON.stringify({ error: { message: `Stream error: ${error}`, type: "internal_error" } })}\n\n`;
            controller.enqueue(encoder.encode(errorChunk));
          } finally {
            console.log(`[DEPLOY] 关闭流式响应控制器`);
            controller.close();
          }
        }
      });

      return new Response(responseStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...corsHeaders
        }
      });
    } else {
      console.log(`[DEPLOY] 处理非流式请求`);
      // 非流式响应
      const responseData = await generateOpenAINonStreamResponse(accountPool, messages, model);
      console.log(`[DEPLOY] 非流式响应完成，数据大小: ${JSON.stringify(responseData).length} 字符`);
      
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders
        }
      });
    }
  } catch (error) {
    console.error(`[DEPLOY] 聊天请求处理错误: ${error}`);
    return createErrorResponse(`Request processing error: ${error}`, "request_error", 500);
  }
}

/**
 * 处理模型列表请求
 */
function handleListModels(corsHeaders: Record<string, string>): Response {
  const models = Object.entries(MODEL_MAPPING).map(([modelName, config]) => ({
    id: modelName,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "freeplay",
    max_tokens: config.max_tokens,
    model_id: config.model_id
  }));

  return new Response(JSON.stringify({
    object: "list",
    data: models
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * 处理账号状态请求
 */
function handleAccountsStatus(corsHeaders: Record<string, string>): Response {
  const stats = accountPool.getAccountStats();
  const accounts = accountPool.getAccounts();

  const response: AccountStatusResponse = {
    total_accounts: stats.total,
    available_accounts: stats.available,
    disabled_accounts: stats.disabled,
    low_balance_accounts: stats.lowBalance,
    total_balance: `$${stats.totalBalance.toFixed(4)}`,
    accounts: accounts.slice(0, 15).map(acc => ({
      email: acc.email,
      balance: `$${acc.balance.toFixed(4)}`,
      status: acc.balance === 0.0 ? "已禁用" : (acc.balance > 0.01 ? "可用" : "余额不足"),
      project_id: acc.project_id.substring(0, 8) + "..."
    }))
  };

  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * 处理测试请求
 */
function handleTest(corsHeaders: Record<string, string>): Response {
  const stats = accountPool.getAccountStats();

  return new Response(JSON.stringify({
    status: "ok",
    message: "FreePlay2OpenAI API is running on Deno Deploy",
    accounts_loaded: stats.total,
    available_accounts: stats.available,
    total_balance: `$${stats.totalBalance.toFixed(4)}`,
    supported_models: Object.keys(MODEL_MAPPING),
    default_model: "claude-3-7-sonnet-20250219",
    environment: "Deno Deploy",
    endpoints: {
      chat_completions: "/v1/chat/completions",
      models: "/v1/models",
      accounts_status: "/accounts/status",
      test: "/test"
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * 处理根路径请求
 */
function handleRoot(corsHeaders: Record<string, string>): Response {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>FreePlay2OpenAI API</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .method { font-weight: bold; color: #007acc; }
    </style>
</head>
<body>
    <div class="container">
        <h1>FreePlay2OpenAI API</h1>
        <p>API服务正在运行中</p>
        
        <h2>可用端点</h2>
        <div class="endpoint">
            <span class="method">POST</span> /v1/chat/completions - 聊天完成接口
        </div>
        <div class="endpoint">
            <span class="method">GET</span> /v1/models - 获取支持的模型列表
        </div>
        <div class="endpoint">
            <span class="method">GET</span> /accounts/status - 查看账号状态
        </div>
        <div class="endpoint">
            <span class="method">GET</span> /test - 服务器状态检查
        </div>
        
        <h2>支持的模型</h2>
        <ul>
            ${Object.keys(MODEL_MAPPING).map(model => `<li>${model}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders
    }
  });
}

// Deno Deploy 入口点
export default {
  fetch: handleRequest
};
