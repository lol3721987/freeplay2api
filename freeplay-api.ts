import type { Account, ChatMessage, FreePlayRequestData, FreePlayParam } from './types.ts';
import { MODEL_MAPPING, validateModel, parseSSELine } from './utils.ts';
import { AccountPool } from './account-pool.ts';

/**
 * 调用FreePlay API，支持自动重试不同账号
 */
export async function callFreeplayAPIWithRetry(
  accountPool: AccountPool,
  messages: ChatMessage[],
  stream: boolean = false,
  model: string = "claude-3-7-sonnet-20250219",
  maxRetries?: number
): Promise<[Response, Account]> {
  if (!maxRetries) {
    maxRetries = accountPool.getAccounts().length; // 最多重试所有账号
  }

  // 验证并获取模型配置
  const [isValid, errorMsg] = validateModel(model);
  if (!isValid) {
    throw new Error(errorMsg!);
  }

  const modelConfig = MODEL_MAPPING[model];

  for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
    // 获取当前可用账号
    const account = await accountPool.getCurrentAccount();
    if (!account) {
      throw new Error("没有可用的账号");
    }

    console.log(`[DEBUG] 尝试第 ${retryCount + 1} 次，选择的账号: ${account.email}`);
    console.log(`[DEBUG] 使用模型: ${model}`);
    console.log(`[DEBUG] Model ID: ${modelConfig.model_id}`);
    console.log(`[DEBUG] Max Tokens: ${modelConfig.max_tokens}`);
    console.log(`[DEBUG] Project ID: ${account.project_id}`);
    console.log(`[DEBUG] Session ID: ${account.session_id.substring(0, 20)}...`);

    const headers = {
      "accept": "*/*",
      "origin": "https://app.freeplay.ai",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      "cookie": `session=${account.session_id}`
    };

    // 使用账号的project_id构建URL
    const url = `https://app.freeplay.ai/app_data/projects/${account.project_id}/llm-completions`;
    console.log(`[DEBUG] 请求URL: ${url}`);

    // JSON数据
    const jsonData: FreePlayRequestData = {
      messages: messages,
      params: [
        {
          initial_value: modelConfig.max_tokens,
          is_advanced: false,
          name: "max_tokens",
          nested_fields: null,
          range: null,
          str_options: null,
          tooltipText: null,
          type: "integer",
          value: modelConfig.max_tokens
        },
        {
          name: "temperature",
          value: 0.08,
          type: "float"
        },
        {
          name: "top_p",
          value: 0.14,
          type: "float"
        },
        {
          name: "top_k",
          value: 1,
          type: "integer"
        }
      ] as FreePlayParam[],
      model_id: modelConfig.model_id,
      variables: {},
      history: null,
      asset_references: {}
    };

    console.log(`[DEBUG] 请求数据: ${JSON.stringify(jsonData).substring(0, 200)}...`);

    // 构建FormData
    const formData = new FormData();
    formData.append('json_data', JSON.stringify(jsonData));

    console.log(`[DEBUG] Headers: ${JSON.stringify(headers)}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: formData
      });

      console.log(`[DEBUG] 响应状态码: ${response.status}`);
      console.log(`[DEBUG] 响应头: ${JSON.stringify([...response.headers.entries()])}`);

      if (response.status !== 200) {
        const errorContent = await response.text();
        console.log(`[DEBUG] 错误响应内容: ${errorContent.substring(0, 500)}`);

        // 检查是否是"Path Not Found"错误
        if (errorContent.includes("Path Not Found")) {
          console.log(`[DEBUG] 账号 ${account.email} 项目路径不存在，禁用该账号`);
          const oldBalance = account.balance;
          account.balance = 0.0;
          accountPool.updateBalance(account.session_id, 0.0);
          console.log(`[DEBUG] 账号 ${account.email} 已禁用 ($${oldBalance.toFixed(4)} -> $0.0000)`);
          await accountPool.saveAccounts();
          continue;
        }

        // 如果是401或404错误，禁用该账号
        if (response.status === 401 || response.status === 404) {
          const oldBalance = account.balance;
          account.balance = 0.0;
          accountPool.updateBalance(account.session_id, 0.0);
          console.log(`[DEBUG] 账号 ${account.email} 请求失败(状态码: ${response.status})，已禁用该账号 ($${oldBalance.toFixed(4)} -> $0.0000)`);
          // 保存更新后的账号信息
          await accountPool.saveAccounts();
          continue;
        }

        // 其他错误，也尝试下一个账号
        console.log(`[DEBUG] 账号 ${account.email} 请求失败，尝试下一个账号`);
        continue;
      }

      // 请求成功，返回结果
      console.log(`[DEBUG] 账号 ${account.email} 请求成功`);
      return [response, account];

    } catch (error) {
      console.log(`[DEBUG] 账号 ${account.email} 请求异常: ${error}，尝试下一个账号`);
      continue;
    }
  }

  // 所有账号都尝试失败
  throw new Error(`所有账号都无法完成请求，已尝试 ${maxRetries} 次`);
}

/**
 * 生成OpenAI格式的流式响应
 */
export async function* generateOpenAIStreamResponse(
  accountPool: AccountPool,
  messages: ChatMessage[],
  model: string = "claude-3-7-sonnet-20250219"
): AsyncGenerator<string, void, unknown> {
  try {
    const [response, account] = await callFreeplayAPIWithRetry(accountPool, messages, true, model);
    const chatId = `chatcmpl-${crypto.randomUUID().replace(/-/g, '').substring(0, 29)}`;
    const created = Math.floor(Date.now() / 1000);

    console.log(`使用账号: ${account.email} (余额: $${account.balance.toFixed(2)})`);

    // 检查响应状态
    if (response.status !== 200) {
      const errorChunk = {
        error: {
          message: `FreePlay API error: ${response.status}`,
          type: "api_error"
        }
      };
      yield `data: ${JSON.stringify(errorChunk)}\n\n`;
      return;
    }

    // 发送开始chunk
    const startChunk = {
      id: chatId,
      object: "chat.completion.chunk",
      created: created,
      model: model,
      choices: [{
        index: 0,
        delta: { role: "assistant", content: "" },
        finish_reason: null
      }]
    };
    yield `data: ${JSON.stringify(startChunk)}\n\n`;

    // 处理流式数据
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line && line.startsWith('data: ')) {
              try {
                const freeplayData = JSON.parse(line.substring(6)); // 去掉 'data: ' 前缀

                // 检查错误
                if (freeplayData.error) {
                  const errorChunk = {
                    error: {
                      message: freeplayData.error,
                      type: "api_error"
                    }
                  };
                  yield `data: ${JSON.stringify(errorChunk)}\n\n`;
                  return;
                }

                // 处理内容
                if (freeplayData.content) {
                  const contentChunk = {
                    id: chatId,
                    object: "chat.completion.chunk",
                    created: created,
                    model: model,
                    choices: [{
                      index: 0,
                      delta: { content: freeplayData.content },
                      finish_reason: null
                    }]
                  };
                  yield `data: ${JSON.stringify(contentChunk)}\n\n`;
                }

                // 检查是否结束（cost字段表示结束）
                if (freeplayData.cost !== undefined) {
                  // 对话结束后重新获取最新余额
                  console.log(`对话结束，重新获取账号 ${account.email} 的最新余额...`);
                  await accountPool.updateAccountBalance(account);
                  // 保存更新后的账号信息
                  await accountPool.saveAccounts();

                  // 检查余额是否不足，如果不足则提示下次会切换账号
                  if (account.balance <= 0.01) {
                    console.log(`账号 ${account.email} 余额不足 ($${account.balance.toFixed(4)})，下次请求将自动切换到下一个账号`);
                  }

                  const endChunk = {
                    id: chatId,
                    object: "chat.completion.chunk",
                    created: created,
                    model: model,
                    choices: [{
                      index: 0,
                      delta: {},
                      finish_reason: "stop"
                    }]
                  };
                  yield `data: ${JSON.stringify(endChunk)}\n\n`;
                  yield "data: [DONE]\n\n";
                  return;
                }

              } catch (error) {
                console.log(`JSON decode error: ${error}, line: ${line}`);
                continue;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // 如果没有正常结束，发送结束chunk
    const endChunk = {
      id: chatId,
      object: "chat.completion.chunk",
      created: created,
      model: model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: "stop"
      }]
    };
    yield `data: ${JSON.stringify(endChunk)}\n\n`;
    yield "data: [DONE]\n\n";

  } catch (error) {
    console.log(`Stream error: ${error}`);
    const errorChunk = {
      error: {
        message: `Stream processing error: ${error}`,
        type: "internal_error"
      }
    };
    yield `data: ${JSON.stringify(errorChunk)}\n\n`;
  }
}

/**
 * 生成OpenAI格式的非流式响应
 */
export async function generateOpenAINonStreamResponse(
  accountPool: AccountPool,
  messages: ChatMessage[],
  model: string = "claude-3-7-sonnet-20250219"
): Promise<any> {
  try {
    const [response, account] = await callFreeplayAPIWithRetry(accountPool, messages, false, model);

    console.log(`使用账号: ${account.email} (余额: $${account.balance.toFixed(2)})`);

    // 检查响应状态
    if (response.status !== 200) {
      return {
        error: {
          message: `FreePlay API error: ${response.status}`,
          type: "api_error"
        }
      };
    }

    // 收集所有内容
    let fullContent = "";
    let cost = null;

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line && line.startsWith('data: ')) {
              try {
                const freeplayData = JSON.parse(line.substring(6));

                if (freeplayData.error) {
                  return {
                    error: {
                      message: freeplayData.error,
                      type: "api_error"
                    }
                  };
                }

                if (freeplayData.content) {
                  fullContent += freeplayData.content;
                }
                if (freeplayData.cost !== undefined) {
                  cost = freeplayData.cost;
                }

              } catch {
                continue;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // 对话结束后重新获取最新余额
    if (cost !== null) {
      console.log(`对话结束，重新获取账号 ${account.email} 的最新余额...`);
      await accountPool.updateAccountBalance(account);
      // 保存更新后的账号信息
      await accountPool.saveAccounts();

      // 检查余额是否不足，如果不足则提示下次会切换账号
      if (account.balance <= 0.01) {
        console.log(`账号 ${account.email} 余额不足 ($${account.balance.toFixed(4)})，下次请求将自动切换到下一个账号`);
      }
    }

    // 返回OpenAI格式的完整响应
    return {
      id: `chatcmpl-${crypto.randomUUID().replace(/-/g, '').substring(0, 29)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: fullContent
        },
        finish_reason: "stop"
      }],
      usage: {
        prompt_tokens: 0, // FreePlay不提供token计数
        completion_tokens: 0,
        total_tokens: 0
      }
    };

  } catch (error) {
    return {
      error: {
        message: `Processing error: ${error}`,
        type: "internal_error"
      }
    };
  }
} 