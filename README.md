# FreePlay2OpenAI API (Deno版本)

[![Deno Version](https://img.shields.io/badge/deno-1.40%2B-brightgreen)](https://deno.land/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个将FreePlay API转换为OpenAI格式的代理服务，使用Deno TypeScript实现。支持多种配置方式，提供安全、灵活的账号管理。

## 🚀 主要功能

- **🔄 智能账号管理**: 自动切换账号，支持余额检查和故障重试
- **⚙️ 灵活配置管理**: 支持环境变量、JSON文件、TXT文件三种配置方式
- **🔒 安全性增强**: 环境变量配置，避免敏感信息泄露
- **🚀 OpenAI兼容**: 完全兼容OpenAI API格式，无缝替换
- **📡 流式响应**: 支持Server-Sent Events流式输出
- **🔒 类型安全**: 完整TypeScript类型定义
- **⚡ 高性能**: 基于Deno原生HTTP服务器
- **🌐 CORS支持**: 内置跨域请求支持

## 📦 快速开始

### 环境要求

- **Deno 1.40+**: [安装指南](https://deno.land/#installation)
- **FreePlay账号**: 有效的session_id和project_id

### 🔧 本地开发

1. **安装Deno** (如果还没有安装)：

   **macOS/Linux:**
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```

   **Windows (PowerShell):**
   ```powershell
   irm https://deno.land/install.ps1 | iex
   ```

2. **克隆项目**：
   ```bash
   git clone <your-repo>
   cd freeplay2openai-deno
   ```

3. **配置账号** (选择一种方式)：

   **方式1: 环境变量 (推荐)**
   ```bash
   export ACCOUNTS_JSON='{
     "accounts": [
       {
         "email": "your-email@example.com",
         "password": "your-password",
         "session_id": "your-session-id",
         "project_id": "your-project-id",
         "balance": 5.0
       }
     ]
   }'
   ```

   **方式2: JSON文件**
   ```bash
   cp accounts.example.json accounts.json
   # 编辑 accounts.json 文件
   ```

   **方式3: TXT文件 (兼容)**
   ```bash
   echo "your-email@example.com----your-password----your-session-id----your-project-id----5.0000" > accounts.txt
   ```

4. **启动服务**：
   ```bash
   # 开发模式 (自动重载)
   deno task dev
   
   # 生产模式
   deno task start
   ```

5. **验证运行**：
   ```bash
   curl http://localhost:8000/test
   ```

### ☁️ 部署指南

#### Deno Deploy

1. **fork项目到您的GitHub**

2. **在 [Deno Deploy](https://dash.deno.com) 创建项目**

3. **设置环境变量**：
   ```bash
   ACCOUNTS_JSON={"accounts":[{"email":"...","session_id":"...","project_id":"...","balance":5.0}]}
   PORT=8000
   ```

4. **部署完成**，访问您的部署URL

#### 其他平台部署

- **Railway**: 支持Deno部署
- **Fly.io**: 使用Dockerfile部署
- **VPS**: 使用systemd或PM2管理

## 🔧 配置管理

### 配置优先级

系统按以下顺序加载配置：

1. **环境变量** `ACCOUNTS_JSON` ⭐ (推荐)
2. **JSON文件** `accounts.json` 或 `config.json`
3. **TXT文件** `accounts.txt` (向后兼容)

### 详细配置说明

#### 1. 环境变量配置 (生产推荐)

**单账号配置**：
```bash
export ACCOUNTS_JSON='{
  "accounts": [
    {
      "email": "user@example.com",
      "password": "password123",
      "session_id": "your-session-id-here",
      "project_id": "your-project-id-here", 
      "balance": 5.0
    }
  ],
  "port": 8000,
  "default_balance": 5.0
}'
```

**多账号配置**：
```bash
export ACCOUNTS_JSON='{
  "accounts": [
    {
      "email": "user1@example.com",
      "session_id": "session1",
      "project_id": "project1",
      "balance": 5.0
    },
    {
      "email": "user2@example.com", 
      "session_id": "session2",
      "project_id": "project2",
      "balance": 3.5
    }
  ]
}'
```

#### 2. JSON文件配置 (开发推荐)

创建 `accounts.json`：
```json
{
  "accounts": [
    {
      "email": "user@example.com",
      "password": "password123",
      "session_id": "your-session-id",
      "project_id": "your-project-id",
      "balance": 5.0
    }
  ],
  "port": 8000,
  "default_balance": 5.0
}
```

#### 3. TXT文件配置 (兼容模式)

`accounts.txt` 格式：
```
email----password----session_id----project_id----balance
user@example.com----password123----session123----project123----5.0000
```

### 获取账号信息

#### session_id 获取方法
1. 登录 [FreePlay](https://freeplay.ai)
2. 打开浏览器开发者工具 (F12)
3. 查看 Application → Cookies → `session` 字段值

#### project_id 获取方法
1. 在FreePlay控制台中访问项目
2. 从URL中提取项目ID (UUID格式)
3. 例如：`https://freeplay.ai/project/12345678-abcd-1234-efgh-123456789012`

## 📡 API端点

### OpenAI兼容端点

| 端点 | 方法 | 描述 | 兼容性 |
|------|------|------|--------|
| `/v1/chat/completions` | POST | 聊天完成API | ✅ OpenAI格式 |
| `/v1/models` | GET | 获取支持的模型列表 | ✅ OpenAI格式 |

### 管理端点

| 端点 | 方法 | 描述 | 功能 |
|------|------|------|------|
| `/accounts/status` | GET | 查看账号状态 | 余额、可用性统计 |
| `/accounts/reload` | POST | 重新加载账号 | 热重载配置 |
| `/accounts/update-balance` | POST | 更新所有账号余额 | 批量余额刷新 |
| `/accounts/reset-disabled` | POST | 重置被禁用的账号 | 恢复禁用账号 |
| `/config/status` | GET | 查看配置状态 | 配置源和环境变量 |
| `/config/example` | GET | 获取配置示例 | 配置格式参考 |
| `/test` | GET | 健康检查 | 服务状态检查 |

### 使用示例

#### 聊天完成 (非流式)

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-7-sonnet-20250219",
    "messages": [
      {"role": "user", "content": "你好，请介绍一下Deno"}
    ],
    "stream": false,
    "max_tokens": 1000,
    "temperature": 0.7
  }'
```

#### 聊天完成 (流式)

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-7-sonnet-20250219", 
    "messages": [
      {"role": "user", "content": "写一个Python快速排序算法"}
    ],
    "stream": true
  }'
```

#### 账号管理

```bash
# 查看账号状态
curl http://localhost:8000/accounts/status

# 更新账号余额
curl -X POST http://localhost:8000/accounts/update-balance

# 查看配置状态
curl http://localhost:8000/config/status

# 获取配置示例
curl http://localhost:8000/config/example
```

## 🤖 支持的模型

| 模型名称 | 模型ID | 说明 |
|----------|---------|------|
| Claude 3.7 Sonnet | `claude-3-7-sonnet-20250219` | 默认模型，平衡性能 |
| Claude 4 Opus | `claude-4-opus-20250514` | 最强性能 |
| Claude 4 Sonnet | `claude-4-sonnet` | 快速响应 |

## 🔒 环境变量

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `ACCOUNTS_JSON` | JSON格式账号配置 | - | 见配置示例 |
| `PORT` | 服务器端口 | 8000 | 3000 |

## ⚡ 权限配置

Deno需要以下权限：

```bash
deno run \
  --allow-net \      # 网络访问
  --allow-read \     # 读取配置文件  
  --allow-write \    # 保存账号状态
  --allow-env \      # 读取环境变量
  main.ts
```

## 🛠️ 故障排除

### 常见问题

**1. 账号无法使用**
```bash
# 检查账号状态
curl http://localhost:8000/accounts/status

# 更新账号余额
curl -X POST http://localhost:8000/accounts/update-balance
```

**2. 配置加载失败**
```bash
# 查看配置状态
curl http://localhost:8000/config/status

# 检查环境变量
echo $ACCOUNTS_JSON
```

**3. 权限错误**
```bash
# 确保运行权限正确
deno task start
```

**4. 网络连接问题**
```bash
# 测试FreePlay连通性
curl https://freeplay.ai

# 检查代理设置
echo $HTTP_PROXY
```

### 调试模式

```bash
# 启用详细日志
deno run --log-level=debug --allow-all main.ts

# 检查账号配置
curl http://localhost:8000/config/example
```

## 🏗️ 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| **运行时** | Deno | 1.40+ |
| **语言** | TypeScript | 5.0+ |
| **HTTP服务器** | Deno.serve | 原生 |
| **HTTP客户端** | fetch API | 标准 |
| **流处理** | Web Streams | 标准 |
| **类型系统** | TypeScript | 严格模式 |

## 📁 项目结构

```
freeplay2openai-deno/
├── 📄 main.ts                # 主服务器入口
├── 📄 types.ts               # TypeScript类型定义
├── 📄 utils.ts               # 工具函数和模型配置
├── 📄 account-pool.ts        # 账号池管理逻辑
├── 📄 config-manager.ts      # 配置管理器 (新增)
├── 📄 freeplay-api.ts        # FreePlay API调用封装
├── ⚙️  deno.json             # Deno项目配置
├── 📄 accounts.txt           # TXT格式账号文件 (兼容)
├── 📄 accounts.example.json  # JSON配置示例
├── 📄 README.md              # 项目文档
├── 📄 DEPLOYMENT.md          # 部署指南
└── 📁 issues/                # 任务记录目录
    └── 📄 账号配置管理重构.md
```

## 🚀 性能优化

### 生产环境建议

1. **使用环境变量配置**：避免文件I/O开销
2. **合理设置账号数量**：建议3-5个账号轮询
3. **监控账号余额**：定期调用更新余额API
4. **启用日志记录**：便于问题排查

### 资源监控

```bash
# 查看服务状态
curl http://localhost:8000/test

# 查看账号统计
curl http://localhost:8000/accounts/status | jq .
```

## 🤝 贡献指南

1. **Fork项目**
2. **创建功能分支**: `git checkout -b feature/new-feature`
3. **提交更改**: `git commit -am 'Add new feature'`
4. **推送分支**: `git push origin feature/new-feature`
5. **创建Pull Request**

## 📄 许可证

本项目采用 [MIT License](https://opensource.org/licenses/MIT) 许可证。

## 🔗 相关链接

- [Deno官网](https://deno.land/)
- [FreePlay AI](https://freeplay.ai/)
- [OpenAI API文档](https://platform.openai.com/docs/api-reference)
- [项目Issues](https://github.com/your-repo/issues)

---

⭐ 如果这个项目对您有帮助，请给个Star支持！ 