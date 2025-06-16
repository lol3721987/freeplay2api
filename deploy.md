# Deno Deploy 部署指南

## 修复内容

本次修复主要解决了以下问题：

1. **流式响应处理优化**
   - 添加了详细的调试日志，便于追踪问题
   - 改进了流数据的缓冲和解析逻辑
   - 修复了可能的编码问题
   - 添加了更好的错误处理

2. **响应头优化**
   - 设置了正确的Content-Type和字符编码
   - 添加了Cache-Control头防止缓存
   - 添加了X-Accel-Buffering头禁用Nginx缓冲

3. **错误处理改进**
   - 添加了更详细的错误日志
   - 改进了异常捕获和处理
   - 添加了堆栈跟踪信息

## 部署到 Deno Deploy

### 推荐方法: 使用专用部署文件

为了更好的兼容性，建议使用 `deno-deploy.ts` 作为入口文件：

1. 将代码推送到GitHub仓库
2. 访问 https://dash.deno.com
3. 点击 "New Project"
4. 选择GitHub仓库
5. **重要**: 设置入口文件为 `deno-deploy.ts` (不是main.ts)
6. 配置环境变量（见下方详细说明）

### 方法1: 通过GitHub集成（推荐）

1. 将所有文件推送到GitHub仓库
2. 访问 https://dash.deno.com
3. 登录您的GitHub账号
4. 点击 "New Project"
5. 选择您的GitHub仓库
6. 在项目设置中：
   - **Entry Point**: `deno-deploy.ts`
   - **Environment Variables**: 添加 `ACCOUNTS_JSON`（见下方配置）
7. 点击 "Deploy"

### 方法2: 通过deployctl命令行

1. 安装deployctl：
   ```bash
   deno install --allow-read --allow-write --allow-env --allow-net --allow-run --no-check -r -f https://deno.land/x/deploy/deployctl.ts
   ```

2. 部署项目：
   ```bash
   deployctl deploy --project=your-project-name deno-deploy.ts
   ```

### 方法3: 直接上传文件

1. 访问 https://dash.deno.com
2. 点击 "New Project"
3. 选择 "Upload files"
4. 上传所有 `.ts` 文件
5. 设置入口文件为 `deno-deploy.ts`
6. 配置环境变量

### 环境变量配置

在Deno Deploy控制台中设置以下环境变量：

```json
ACCOUNTS_JSON={
  "accounts": [
    {
      "email": "your@email.com",
      "password": "your_password",
      "session_id": "your_session_id",
      "project_id": "your_project_id",
      "balance": 5.0
    }
  ],
  "port": 8000,
  "default_balance": 5.0
}
```

## 本地测试

1. 启动服务器：
   ```bash
   deno run --allow-all main.ts
   ```

2. 运行测试脚本：
   ```bash
   deno run --allow-all test-stream.ts
   ```

## 调试信息

修复后的版本包含详细的调试日志：

- `[STREAM]` - 流式响应相关日志
- `[NON-STREAM]` - 非流式响应相关日志
- `[MAIN]` - 主处理函数日志
- `[DEBUG]` - API调用调试信息

这些日志将帮助您识别请求处理过程中的任何问题。

## 常见问题解决

### 1. 请求无返回
- 检查账号配置是否正确
- 查看控制台日志中的错误信息
- 确认session_id和project_id有效

### 2. 流式响应中断
- 检查网络连接稳定性
- 查看是否有代理或CDN缓存问题
- 确认响应头设置正确

### 3. 账号余额问题
- 使用 `/accounts/status` 检查账号状态
- 使用 `/accounts/update-balance` 更新余额
- 使用 `/accounts/reset-disabled` 重置禁用账号

## API端点

- `POST /v1/chat/completions` - 聊天完成（支持流式和非流式）
- `GET /v1/models` - 获取支持的模型列表
- `GET /accounts/status` - 查看账号状态
- `POST /accounts/reload` - 重新加载账号配置
- `POST /accounts/update-balance` - 更新所有账号余额
- `GET /test` - 服务器状态检查

## 支持的模型

- claude-3-7-sonnet-20250219 (默认)
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022
- gpt-4o
- gpt-4o-mini
- o1-preview
- o1-mini

使用时请确保您的Freeplay账号有权限访问相应的模型。
