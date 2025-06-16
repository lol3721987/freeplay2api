import type { ChatCompletionRequest, AccountStatusResponse } from './types.ts';
import { MODEL_MAPPING, validateModel, createErrorResponse } from './utils.ts';
import { AccountPool } from './account-pool.ts';
import { generateOpenAIStreamResponse, generateOpenAINonStreamResponse } from './freeplay-api.ts';
import { ConfigManager } from './config-manager.ts';

// Deno类型声明
declare global {
  namespace Deno {
    export const env: {
      get(key: string): string | undefined;
    };
    export function serve(options: { port: number }, handler: (request: Request) => Response | Promise<Response>): any;
  }

  interface ImportMeta {
    main: boolean;
  }
}

// 初始化配置管理器和账号池
const configManager = new ConfigManager();
const accountPool = new AccountPool(configManager);

/**
 * 路由处理函数
 */
function handleRequest(request: Request): Response | Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  console.log(`${method} ${pathname}`);

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

  // 路由分发
  switch (pathname) {
    case '/v1/chat/completions':
      if (method === 'POST') {
        return handleChatCompletions(request, corsHeaders);
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

    case '/accounts/reload':
      if (method === 'POST') {
        return handleAccountsReload(corsHeaders);
      }
      break;

    case '/accounts/update-balance':
      if (method === 'POST') {
        return handleUpdateBalance(corsHeaders);
      }
      break;

    case '/accounts/reset-disabled':
      if (method === 'POST') {
        return handleResetDisabled(request, corsHeaders);
      }
      break;

    case '/config/status':
      if (method === 'GET') {
        return handleConfigStatus(corsHeaders);
      }
      break;

    case '/config/example':
      if (method === 'GET') {
        return handleConfigExample(corsHeaders);
      }
      break;

    case '/test':
      if (method === 'GET') {
        return handleTest(corsHeaders);
      }
      break;

    default:
      return new Response('Not Found', { status: 404, headers: corsHeaders });
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
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
      console.log(`[MAIN] 处理流式请求`);
      // 流式响应
      const responseStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          console.log(`[MAIN] 开始流式响应控制器`);

          try {
            let chunkCount = 0;
            for await (const chunk of generateOpenAIStreamResponse(accountPool, messages, model)) {
              chunkCount++;
              console.log(`[MAIN] 发送流式数据块 ${chunkCount}: ${chunk.length} 字符`);
              controller.enqueue(encoder.encode(chunk));
            }
            console.log(`[MAIN] 流式响应完成，共发送 ${chunkCount} 个数据块`);
          } catch (error) {
            console.error(`[MAIN] 流式响应错误: ${error}`);
            const errorChunk = `data: ${JSON.stringify({ error: { message: `Stream error: ${error}`, type: "internal_error" } })}\n\n`;
            controller.enqueue(encoder.encode(errorChunk));
          } finally {
            console.log(`[MAIN] 关闭流式响应控制器`);
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
          'X-Accel-Buffering': 'no', // 禁用Nginx缓冲
          ...corsHeaders
        }
      });
    } else {
      console.log(`[MAIN] 处理非流式请求`);
      // 非流式响应
      const responseData = await generateOpenAINonStreamResponse(accountPool, messages, model);
      console.log(`[MAIN] 非流式响应完成，数据大小: ${JSON.stringify(responseData).length} 字符`);

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders
        }
      });
    }
  } catch (error) {
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
 * 处理账号重新加载请求
 */
async function handleAccountsReload(corsHeaders: Record<string, string>): Promise<Response> {
  await accountPool.loadAccounts();
  const stats = accountPool.getAccountStats();

  return new Response(JSON.stringify({
    message: `重新加载完成，共 ${stats.total} 个账号`
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * 处理更新余额请求
 */
async function handleUpdateBalance(corsHeaders: Record<string, string>): Promise<Response> {
  const result = await accountPool.updateAllBalances();

  return new Response(JSON.stringify({
    message: "余额更新完成",
    updated_accounts: result.updated,
    failed_accounts: result.failed,
    total_accounts: accountPool.getAccounts().length
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * 处理重置禁用账号请求
 */
async function handleResetDisabled(request: Request, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const data = await request.json().catch(() => ({}));
    const defaultBalance = data.default_balance || 5.0;

    const resetCount = await accountPool.resetDisabledAccounts(defaultBalance);

    return new Response(JSON.stringify({
      message: "重置完成",
      reset_accounts: resetCount,
      default_balance: `$${defaultBalance.toFixed(4)}`
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    return createErrorResponse(`Reset error: ${error}`, "request_error", 500);
  }
}

/**
 * 处理配置状态请求
 */
function handleConfigStatus(corsHeaders: Record<string, string>): Response {
  const config = configManager.getConfig();
  const hasEnvConfig = !!Deno.env.get("ACCOUNTS_JSON");

  return new Response(JSON.stringify({
    config_source: hasEnvConfig ? "environment" : "file",
    accounts_count: config.accounts.length,
    port: config.port,
    default_balance: config.default_balance,
    environment_variables: {
      ACCOUNTS_JSON: hasEnvConfig ? "设置" : "未设置",
      PORT: Deno.env.get("PORT") || "未设置"
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * 处理配置示例请求
 */
function handleConfigExample(corsHeaders: Record<string, string>): Response {
  const example = configManager.generateConfigExample();

  return new Response(JSON.stringify({
    message: "配置示例",
    json_config: JSON.parse(example),
    environment_variable_example: `export ACCOUNTS_JSON='${example}'`,
    file_examples: {
      "accounts.json": example,
      "accounts.txt": "user1@example.com----password123----session123----project123----5.0000"
    }
  }), {
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
    message: "FreePlay2OpenAI API is running",
    accounts_loaded: stats.total,
    available_accounts: stats.available,
    total_balance: `$${stats.totalBalance.toFixed(4)}`,
    supported_models: Object.keys(MODEL_MAPPING),
    default_model: "claude-3-7-sonnet-20250219",
    endpoints: {
      chat_completions: "/v1/chat/completions",
      models: "/v1/models",
      accounts_status: "/accounts/status",
      accounts_reload: "/accounts/reload",
      update_balance: "/accounts/update-balance",
      reset_disabled: "/accounts/reset-disabled",
      config_status: "/config/status",
      config_example: "/config/example"
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * 启动服务器
 */
async function startServer() {
  console.log("Starting FreePlay2OpenAI API server...");
  
  // 等待账号池初始化完成
  await accountPool.loadAccounts();
  console.log(`Loaded ${accountPool.getAccounts().length} accounts from configuration`);

  const port = configManager.getPort();
  
  console.log(`Server running on http://localhost:${port}`);
  
  const server = Deno.serve({ port }, handleRequest);
  return server;
}

// 启动服务器
if (import.meta.main) {
  await startServer();
} 