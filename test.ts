#!/usr/bin/env -S deno run --allow-net

/**
 * FreePlay2OpenAI API测试脚本
 * 用于验证API功能是否正常
 */

const BASE_URL = Deno.env.get('API_URL') || 'http://localhost:8000';

async function testAPI() {
  console.log('🚀 开始测试 FreePlay2OpenAI API...');
  console.log(`📡 测试目标: ${BASE_URL}`);
  
  // 测试1: 健康检查
  console.log('\n📊 测试1: 健康检查');
  try {
    const response = await fetch(`${BASE_URL}/test`);
    const data = await response.json();
    console.log('✅ 健康检查通过:', data.status);
    console.log(`📈 已加载账号: ${data.accounts_loaded}`);
    console.log(`💰 总余额: ${data.total_balance}`);
  } catch (error) {
    console.error('❌ 健康检查失败:', error);
    return;
  }

  // 测试2: 模型列表
  console.log('\n📋 测试2: 获取模型列表');
  try {
    const response = await fetch(`${BASE_URL}/v1/models`);
    const data = await response.json();
    console.log('✅ 模型列表获取成功');
    console.log(`📝 支持的模型数量: ${data.data.length}`);
    data.data.forEach((model: any) => {
      console.log(`  - ${model.id} (${model.max_tokens} tokens)`);
    });
  } catch (error) {
    console.error('❌ 模型列表获取失败:', error);
  }

  // 测试3: 账号状态
  console.log('\n👥 测试3: 账号状态查询');
  try {
    const response = await fetch(`${BASE_URL}/accounts/status`);
    const data = await response.json();
    console.log('✅ 账号状态查询成功');
    console.log(`📊 总账号数: ${data.total_accounts}`);
    console.log(`🟢 可用账号: ${data.available_accounts}`);
    console.log(`🔴 禁用账号: ${data.disabled_accounts}`);
    console.log(`💰 总余额: ${data.total_balance}`);
  } catch (error) {
    console.error('❌ 账号状态查询失败:', error);
  }

  // 测试4: 聊天API (非流式)
  console.log('\n💬 测试4: 聊天API (非流式)');
  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-7-sonnet-20250219',
        messages: [
          {
            role: 'user',
            content: 'Say "Hello, API test successful!" and nothing else.'
          }
        ],
        stream: false
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('❌ 聊天API测试失败:', data.error.message);
    } else {
      console.log('✅ 聊天API测试成功');
      console.log(`🤖 AI回复: ${data.choices[0].message.content}`);
    }
  } catch (error) {
    console.error('❌ 聊天API测试失败:', error);
  }

  // 测试5: 聊天API (流式) - 简单测试
  console.log('\n📡 测试5: 聊天API (流式)');
  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-7-sonnet-20250219',
        messages: [
          {
            role: 'user',
            content: 'Count from 1 to 3, each number on a new line.'
          }
        ],
        stream: true
      })
    });

    if (response.ok && response.body) {
      console.log('✅ 流式响应连接成功');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let chunkCount = 0;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          chunkCount++;
          
          // 只显示前5个chunk的内容
          if (chunkCount <= 5) {
            console.log(`📦 Chunk ${chunkCount}: ${chunk.substring(0, 100)}...`);
          }
          
          // 检查是否包含 [DONE]
          if (chunk.includes('[DONE]')) {
            console.log('✅ 流式响应正常结束');
            break;
          }
        }
        console.log(`📊 总共接收到 ${chunkCount} 个数据块`);
      } finally {
        reader.releaseLock();
      }
    } else {
      console.error('❌ 流式响应失败:', response.status);
    }
  } catch (error) {
    console.error('❌ 流式API测试失败:', error);
  }

  console.log('\n🎉 API测试完成!');
}

// 运行测试
if (import.meta.main) {
  testAPI().catch(console.error);
} 