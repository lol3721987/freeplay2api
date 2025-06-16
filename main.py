import requests
import json
from flask import Flask, request, Response, jsonify
import time
import uuid
import random
import os

app = Flask(__name__)

# 模型映射表
MODEL_MAPPING = {
    # "claude-3-5-sonnet-20241022": {
    #     "model_id": "ebc7dd5-a24d-4147-85b0-8f62902ea1a3",
    #     "max_tokens": 8192
    # },
    "claude-3-7-sonnet-20250219": {
        "model_id": "be71f37b-1487-49fa-a989-a9bb99c0b129", 
        "max_tokens": 64000
    },
    "claude-4-opus-20250514": {
        "model_id": "bebc7dd5-a24d-4147-85b0-8f62902ea1a3",
        "max_tokens": 32000
    },
    "claude-4-sonnet": {
        "model_id": "884dde7c-8def-4365-b19a-57af2787ab84",
        "max_tokens": 64000
    }
}

def validate_model(model_name):
    """验证模型名称是否存在"""
    if model_name not in MODEL_MAPPING:
        return False, f"模型 '{model_name}' 不存在。支持的模型: {', '.join(MODEL_MAPPING.keys())}"
    return True, None

def get_account_balance(session_id):
    """获取账号余额信息"""
    try:
        headers = {
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
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
        }
        
        cookies = {
            "session": session_id
        }
        
        response = requests.get(
            "https://app.freeplay.ai/app_data/settings/billing",
            headers=headers,
            cookies=cookies
        )
        
        if response.status_code == 200:
            data = response.json()
            # 查找 Freeplay credits 的使用情况
            for feature in data.get('feature_usage', []):
                if feature.get('feature_name') == 'Freeplay credits':
                    usage_limit = feature.get('usage_limit', 0)
                    usage_value = feature.get('usage_value', 0)
                    remaining_balance = usage_limit - usage_value
                    return remaining_balance, True
            return 0, False
        else:
            # 401表示账号被禁用或session过期，404表示资源不存在
            if response.status_code == 401:
                print(f"获取余额失败，状态码: {response.status_code} (账号可能被禁用或session过期)")
            elif response.status_code == 404:
                print(f"获取余额失败，状态码: {response.status_code} (资源不存在)")
            else:
                print(f"获取余额失败，状态码: {response.status_code}")
            return 0, False
            
    except Exception as e:
        print(f"获取账号余额时出错: {e}")
        return 0, False

class AccountPool:
    def __init__(self, accounts_file="accounts.txt"):
        self.accounts_file = accounts_file
        self.accounts = []
        self.current_index = 0  # 当前账号索引，用于顺序选择
        self.load_accounts()
    
    def load_accounts(self):
        """从文件加载账号信息"""
        if not os.path.exists(self.accounts_file):
            print(f"警告: 账号文件 {self.accounts_file} 不存在")
            return
        
        try:
            with open(self.accounts_file, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    
                    parts = line.split('----')
                    if len(parts) >= 5:
                        account = {
                            'email': parts[0],
                            'password': parts[1], 
                            'session_id': parts[2],
                            'project_id': parts[3],
                            'balance': float(parts[4]) if parts[4].replace('.', '').isdigit() else 0.0
                        }
                        self.accounts.append(account)
                    else:
                        print(f"警告: 第{line_num}行格式不正确: {line}")
            
            print(f"成功加载 {len(self.accounts)} 个账号")
            
        except Exception as e:
            print(f"加载账号文件时出错: {e}")
    
    def update_account_balance(self, account):
        """更新单个账号的余额"""
        try:
            new_balance, success = get_account_balance(account['session_id'])
            if success:
                old_balance = account['balance']
                account['balance'] = new_balance
                print(f"账号 {account['email']} 余额更新: ${old_balance:.4f} -> ${new_balance:.4f}")
                return True
            else:
                # 获取余额失败，将账号余额设置为0，避免再次被选中
                old_balance = account['balance']
                account['balance'] = 0.0
                print(f"账号 {account['email']} 余额更新失败，已禁用该账号 (${old_balance:.4f} -> $0.0000)")
                return False
        except Exception as e:
            # 发生异常，同样将账号余额设置为0
            old_balance = account['balance']
            account['balance'] = 0.0
            print(f"更新账号 {account['email']} 余额时出错: {e}，已禁用该账号 (${old_balance:.4f} -> $0.0000)")
            return False
    
    def get_current_account(self):
        """获取当前账号，如果余额不足则切换到下一个有余额的账号"""
        if not self.accounts:
            return None
        
        # 首先检查当前账号是否可用
        current_account = self.accounts[self.current_index]
        print(f"检查当前账号 {current_account['email']} (索引: {self.current_index}, 余额: ${current_account['balance']:.4f})")
        
        # 如果当前账号余额充足，直接使用
        if current_account['balance'] > 0.01:
            print(f"继续使用当前账号: {current_account['email']} (余额: ${current_account['balance']:.4f})")
            return current_account
        
        # 当前账号余额不足，寻找下一个可用账号
        print(f"当前账号 {current_account['email']} 余额不足，寻找下一个可用账号...")
        
        # 尝试所有账号，从下一个开始
        attempts = 0
        while attempts < len(self.accounts):
            # 移动到下一个账号
            self.current_index = (self.current_index + 1) % len(self.accounts)
            account = self.accounts[self.current_index]
            
            print(f"尝试账号 {account['email']} (索引: {self.current_index}, 当前余额: ${account['balance']:.4f})")
            
            # 如果账号余额大于0.01，更新余额并检查
            if account['balance'] > 0.01:
                print(f"正在更新账号 {account['email']} 的余额...")
                self.update_account_balance(account)
                
                # 检查更新后的余额
                if account['balance'] > 0.01:
                    print(f"切换到新账号: {account['email']} (更新后余额: ${account['balance']:.4f})")
                    return account
                else:
                    print(f"账号 {account['email']} 更新后余额不足，继续下一个账号")
            else:
                print(f"账号 {account['email']} 余额不足，跳过")
            
            attempts += 1
        
        print("警告: 所有账号都不可用")
        return None
    
    def move_to_next_account(self):
        """移动到下一个账号（用于错误重试时）"""
        if self.accounts:
            self.current_index = (self.current_index + 1) % len(self.accounts)
            print(f"切换到下一个账号，当前索引: {self.current_index}")
    
    def get_account_by_session(self, session_id):
        """根据session_id获取账号"""
        for account in self.accounts:
            if account['session_id'] == session_id:
                return account
        return None
    
    def update_balance(self, session_id, new_balance):
        """更新账号余额"""
        for account in self.accounts:
            if account['session_id'] == session_id:
                account['balance'] = new_balance
                break
    
    def save_accounts(self):
        """保存账号信息到文件"""
        try:
            with open(self.accounts_file, 'w', encoding='utf-8') as f:
                for account in self.accounts:
                    line = f"{account['email']}----{account['password']}----{account['session_id']}----{account['project_id']}----{account['balance']:.4f}\n"
                    f.write(line)
        except Exception as e:
            print(f"保存账号文件时出错: {e}")

# 初始化账号池
account_pool = AccountPool()

def call_freeplay_api_with_retry(messages, stream=False, model="claude-3-7-sonnet-20250219", max_retries=None):
    """调用FreePlay API，支持自动重试不同账号"""
    if max_retries is None:
        max_retries = len(account_pool.accounts)  # 最多重试所有账号
    
    # 验证并获取模型配置
    is_valid, error_msg = validate_model(model)
    if not is_valid:
        raise Exception(error_msg)
    
    model_config = MODEL_MAPPING[model]
    
    for retry_count in range(max_retries):
        # 获取当前可用账号
        account = account_pool.get_current_account()
        if not account:
            raise Exception("没有可用的账号")
        
        print(f"[DEBUG] 尝试第 {retry_count + 1} 次，选择的账号: {account['email']}")
        print(f"[DEBUG] 使用模型: {model}")
        print(f"[DEBUG] Model ID: {model_config['model_id']}")
        print(f"[DEBUG] Max Tokens: {model_config['max_tokens']}")
        print(f"[DEBUG] Project ID: {account['project_id']}")
        print(f"[DEBUG] Session ID: {account['session_id'][:20]}...")
        
        headers = {
            "accept": "*/*",
            "origin": "https://app.freeplay.ai",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
        }
        
        cookies = {
            "session": account['session_id']
        }
        
        # 使用账号的project_id构建URL
        url = f"https://app.freeplay.ai/app_data/projects/{account['project_id']}/llm-completions"
        print(f"[DEBUG] 请求URL: {url}")
        
        # JSON数据
        json_data = {
            "messages": messages,
            "params": [
                {
                    "initial_value": model_config['max_tokens'],
                    "is_advanced": False,
                    "name": "max_tokens",
                    "nested_fields": None,
                    "range": None,
                    "str_options": None,
                    "tooltipText": None,
                    "type": "integer",
                    "value": model_config['max_tokens']
                },
                {
                    "name": "temperature",
                    "value": 0.08,
                    "type": "float"
                },
                {
                    "name": "top_p",
                    "value": 0.14,
                    "type": "float"
                },
                {
                    "name": "top_k",
                    "value": 1,
                    "type": "integer"
                }
            ],
            "model_id": model_config['model_id'],
            "variables": {},
            "history": None,
            "asset_references": {}
        }
        
        print(f"[DEBUG] 请求数据: {json.dumps(json_data, ensure_ascii=False)[:200]}...")
        
        # 使用multipart/form-data格式
        files = {
            'json_data': (None, json.dumps(json_data))
        }
        
        print(f"[DEBUG] Headers: {headers}")
        print(f"[DEBUG] Cookies: {cookies}")
        
        try:
            response = requests.post(url, headers=headers, cookies=cookies, files=files, stream=True)
            print(f"[DEBUG] 响应状态码: {response.status_code}")
            print(f"[DEBUG] 响应头: {dict(response.headers)}")
            
            if response.status_code != 200:
                error_content = response.text[:500]
                print(f"[DEBUG] 错误响应内容: {error_content}")
                
                # 检查是否是"Path Not Found"错误
                if "Path Not Found" in error_content:
                    print(f"[DEBUG] 账号 {account['email']} 项目路径不存在，禁用该账号")
                    old_balance = account['balance']
                    account['balance'] = 0.0
                    account_pool.update_balance(account['session_id'], 0.0)
                    print(f"[DEBUG] 账号 {account['email']} 已禁用 (${old_balance:.4f} -> $0.0000)")
                    account_pool.save_accounts()
                    continue
                
                # 如果是401或404错误，禁用该账号
                if response.status_code in [401, 404]:
                    old_balance = account['balance']
                    account['balance'] = 0.0
                    account_pool.update_balance(account['session_id'], 0.0)
                    print(f"[DEBUG] 账号 {account['email']} 请求失败(状态码: {response.status_code})，已禁用该账号 (${old_balance:.4f} -> $0.0000)")
                    # 保存更新后的账号信息
                    account_pool.save_accounts()
                    continue
                
                # 其他错误，也尝试下一个账号
                print(f"[DEBUG] 账号 {account['email']} 请求失败，尝试下一个账号")
                continue
            
            # 请求成功，返回结果
            print(f"[DEBUG] 账号 {account['email']} 请求成功")
            return response, account
            
        except Exception as e:
            print(f"[DEBUG] 账号 {account['email']} 请求异常: {e}，尝试下一个账号")
            continue
    
    # 所有账号都尝试失败
    raise Exception(f"所有账号都无法完成请求，已尝试 {max_retries} 次")

def call_freeplay_api(messages, stream=False, account=None, model="claude-3-7-sonnet-20250219"):
    """调用FreePlay API（兼容性函数）"""
    if account:
        # 如果指定了账号，使用原来的逻辑
        return call_freeplay_api_single(messages, stream, account, model)
    else:
        # 如果没有指定账号，使用重试逻辑
        return call_freeplay_api_with_retry(messages, stream, model)

def call_freeplay_api_single(messages, stream=False, account=None, model="claude-3-7-sonnet-20250219"):
    """调用FreePlay API（单个账号版本）"""
    if not account:
        raise Exception("必须指定账号")
    
    # 验证并获取模型配置
    is_valid, error_msg = validate_model(model)
    if not is_valid:
        raise Exception(error_msg)
    
    model_config = MODEL_MAPPING[model]
    
    print(f"[DEBUG] 选择的账号: {account['email']}")
    print(f"[DEBUG] 使用模型: {model}")
    print(f"[DEBUG] Model ID: {model_config['model_id']}")
    print(f"[DEBUG] Max Tokens: {model_config['max_tokens']}")
    print(f"[DEBUG] Project ID: {account['project_id']}")
    print(f"[DEBUG] Session ID: {account['session_id'][:20]}...")
    
    headers = {
        "accept": "*/*",
        "origin": "https://app.freeplay.ai",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
    }
    
    cookies = {
        "session": account['session_id']
    }
    
    # 使用账号的project_id构建URL
    url = f"https://app.freeplay.ai/app_data/projects/{account['project_id']}/llm-completions"
    print(f"[DEBUG] 请求URL: {url}")
    
    # JSON数据
    json_data = {
        "messages": messages,
        "params": [
            {
                "initial_value": model_config['max_tokens'],
                "is_advanced": False,
                "name": "max_tokens",
                "nested_fields": None,
                "range": None,
                "str_options": None,
                "tooltipText": None,
                "type": "integer",
                "value": model_config['max_tokens']
            },
            {
                "name": "temperature",
                "value": 0.08,
                "type": "float"
            },
            {
                "name": "top_p",
                "value": 0.14,
                "type": "float"
            },
            {
                "name": "top_k",
                "value": 1,
                "type": "integer"
            }
        ],
        "model_id": model_config['model_id'],
        "variables": {},
        "history": None,
        "asset_references": {}
    }
    
    print(f"[DEBUG] 请求数据: {json.dumps(json_data, ensure_ascii=False)[:200]}...")
    
    # 使用multipart/form-data格式
    files = {
        'json_data': (None, json.dumps(json_data))
    }
    
    print(f"[DEBUG] Headers: {headers}")
    print(f"[DEBUG] Cookies: {cookies}")
    
    try:
        response = requests.post(url, headers=headers, cookies=cookies, files=files, stream=True)
        print(f"[DEBUG] 响应状态码: {response.status_code}")
        print(f"[DEBUG] 响应头: {dict(response.headers)}")
        
        if response.status_code != 200:
            print(f"[DEBUG] 错误响应内容: {response.text[:500]}")
            # 如果是401或404错误，禁用该账号
            if response.status_code in [401, 404]:
                old_balance = account['balance']
                account['balance'] = 0.0
                account_pool.update_balance(account['session_id'], 0.0)
                print(f"[DEBUG] 账号 {account['email']} 请求失败(状态码: {response.status_code})，已禁用该账号 (${old_balance:.4f} -> $0.0000)")
                # 保存更新后的账号信息
                account_pool.save_accounts()
        
        return response, account
    except Exception as e:
        print(f"[DEBUG] 请求异常: {e}")
        raise

def generate_openai_stream_response(messages, model="claude-3-7-sonnet-20250219"):
    """生成OpenAI格式的流式响应"""
    try:
        response, account = call_freeplay_api_with_retry(messages, stream=True, model=model)
        chat_id = f"chatcmpl-{uuid.uuid4().hex[:29]}"
        created = int(time.time())
        
        print(f"使用账号: {account['email']} (余额: ${account['balance']:.2f})")
        
        # 检查响应状态
        if response.status_code != 200:
            error_chunk = {
                "error": {
                    "message": f"FreePlay API error: {response.status_code}",
                    "type": "api_error"
                }
            }
            yield f"data: {json.dumps(error_chunk)}\n\n"
            return
        
        # 发送开始chunk
        start_chunk = {
            "id": chat_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {"role": "assistant", "content": ""},
                "finish_reason": None
            }]
        }
        yield f"data: {json.dumps(start_chunk)}\n\n"
        
        # 处理流式数据
        for line in response.iter_lines(decode_unicode=True):
            if line and line.startswith('data: '):
                try:
                    freeplay_data = json.loads(line[6:])  # 去掉 'data: ' 前缀
                    
                    # 检查错误
                    if freeplay_data.get('error'):
                        error_chunk = {
                            "error": {
                                "message": freeplay_data['error'],
                                "type": "api_error"
                            }
                        }
                        yield f"data: {json.dumps(error_chunk)}\n\n"
                        return
                    
                    # 处理内容
                    if freeplay_data.get('content'):
                        chunk = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": model,
                            "choices": [{
                                "index": 0,
                                "delta": {"content": freeplay_data['content']},
                                "finish_reason": None
                            }]
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"
                    
                    # 检查是否结束（cost字段表示结束）
                    if freeplay_data.get('cost') is not None:
                        # 对话结束后重新获取最新余额
                        print(f"对话结束，重新获取账号 {account['email']} 的最新余额...")
                        account_pool.update_account_balance(account)
                        # 保存更新后的账号信息
                        account_pool.save_accounts()
                        
                        # 检查余额是否不足，如果不足则提示下次会切换账号
                        if account['balance'] <= 0.01:
                            print(f"账号 {account['email']} 余额不足 (${account['balance']:.4f})，下次请求将自动切换到下一个账号")
                        
                        end_chunk = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": model,
                            "choices": [{
                                "index": 0,
                                "delta": {},
                                "finish_reason": "stop"
                            }]
                        }
                        yield f"data: {json.dumps(end_chunk)}\n\n"
                        yield "data: [DONE]\n\n"
                        return
                        
                except json.JSONDecodeError as e:
                    print(f"JSON decode error: {e}, line: {line}")
                    continue
                except Exception as e:
                    print(f"Error processing line: {e}, line: {line}")
                    continue
        
        # 如果没有正常结束，发送结束chunk
        end_chunk = {
            "id": chat_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": "stop"
            }]
        }
        yield f"data: {json.dumps(end_chunk)}\n\n"
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        print(f"Stream error: {e}")
        error_chunk = {
            "error": {
                "message": f"Stream processing error: {str(e)}",
                "type": "internal_error"
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"

def generate_openai_non_stream_response(messages, model="claude-3-7-sonnet-20250219"):
    """生成OpenAI格式的非流式响应"""
    try:
        response, account = call_freeplay_api_with_retry(messages, stream=False, model=model)
        
        print(f"使用账号: {account['email']} (余额: ${account['balance']:.2f})")
        
        # 检查响应状态
        if response.status_code != 200:
            return {
                "error": {
                    "message": f"FreePlay API error: {response.status_code}",
                    "type": "api_error"
                }
            }
        
        # 收集所有内容
        full_content = ""
        cost = None
        
        for line in response.iter_lines(decode_unicode=True):
            if line and line.startswith('data: '):
                try:
                    freeplay_data = json.loads(line[6:])
                    
                    if freeplay_data.get('error'):
                        return {
                            "error": {
                                "message": freeplay_data['error'],
                                "type": "api_error"
                            }
                        }
                    
                    if freeplay_data.get('content'):
                        full_content += freeplay_data['content']
                    if freeplay_data.get('cost'):
                        cost = freeplay_data['cost']
                        
                except json.JSONDecodeError:
                    continue
        
        # 对话结束后重新获取最新余额
        if cost:
            print(f"对话结束，重新获取账号 {account['email']} 的最新余额...")
            account_pool.update_account_balance(account)
            # 保存更新后的账号信息
            account_pool.save_accounts()
            
            # 检查余额是否不足，如果不足则提示下次会切换账号
            if account['balance'] <= 0.01:
                print(f"账号 {account['email']} 余额不足 (${account['balance']:.4f})，下次请求将自动切换到下一个账号")
        
        # 返回OpenAI格式的完整响应
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex[:29]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": full_content
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 0,  # FreePlay不提供token计数
                "completion_tokens": 0,
                "total_tokens": 0
            }
        }
        
    except Exception as e:
        return {
            "error": {
                "message": f"Processing error: {str(e)}",
                "type": "internal_error"
            }
        }

@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    """OpenAI兼容的聊天完成API"""
    try:
        data = request.get_json()
        messages = data.get('messages', [])
        stream = data.get('stream', False)
        model = data.get('model', 'claude-3-7-sonnet-20250219')
        
        # 验证模型
        is_valid, error_msg = validate_model(model)
        if not is_valid:
            return jsonify({
                "error": {
                    "message": error_msg,
                    "type": "invalid_request_error",
                    "param": "model",
                    "code": "model_not_found"
                }
            }), 400
        
        if stream:
            return Response(
                generate_openai_stream_response(messages, model),
                mimetype='text/event-stream',
                headers={
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*'
                }
            )
        else:
            response_data = generate_openai_non_stream_response(messages, model)
            return jsonify(response_data)
            
    except Exception as e:
        return jsonify({"error": {"message": str(e), "type": "request_error"}}), 500

@app.route('/accounts/status', methods=['GET'])
def accounts_status():
    """查看账号池状态"""
    total_accounts = len(account_pool.accounts)
    available_accounts = len([acc for acc in account_pool.accounts if acc['balance'] > 0.01])
    disabled_accounts = len([acc for acc in account_pool.accounts if acc['balance'] == 0.0])
    low_balance_accounts = len([acc for acc in account_pool.accounts if 0.0 < acc['balance'] <= 0.01])
    total_balance = sum(acc['balance'] for acc in account_pool.accounts)
    
    return jsonify({
        "total_accounts": total_accounts,
        "available_accounts": available_accounts,
        "disabled_accounts": disabled_accounts,
        "low_balance_accounts": low_balance_accounts,
        "total_balance": f"${total_balance:.4f}",
        "accounts": [
            {
                "email": acc['email'],
                "balance": f"${acc['balance']:.4f}",
                "status": "已禁用" if acc['balance'] == 0.0 else ("可用" if acc['balance'] > 0.01 else "余额不足"),
                "project_id": acc['project_id'][:8] + "..."
            } for acc in account_pool.accounts[:15]  # 显示前15个
        ]
    })

@app.route('/accounts/reload', methods=['POST'])
def reload_accounts():
    """重新加载账号池"""
    account_pool.load_accounts()
    return jsonify({"message": f"重新加载完成，共 {len(account_pool.accounts)} 个账号"})

@app.route('/accounts/update-balance', methods=['POST'])
def update_all_balances():
    """更新所有账号的余额"""
    updated_count = 0
    failed_count = 0
    
    for account in account_pool.accounts:
        if account_pool.update_account_balance(account):
            updated_count += 1
        else:
            failed_count += 1
    
    # 保存更新后的账号信息
    account_pool.save_accounts()
    
    return jsonify({
        "message": f"余额更新完成",
        "updated_accounts": updated_count,
        "failed_accounts": failed_count,
        "total_accounts": len(account_pool.accounts)
    })

@app.route('/accounts/reset-disabled', methods=['POST'])
def reset_disabled_accounts():
    """重置被禁用的账号（将余额为0的账号恢复为默认值）"""
    data = request.get_json() or {}
    default_balance = data.get('default_balance', 5.0)  # 默认恢复到5美元
    
    reset_count = 0
    for account in account_pool.accounts:
        if account['balance'] == 0.0:
            account['balance'] = default_balance
            reset_count += 1
            print(f"重置账号 {account['email']} 余额: $0.0000 -> ${default_balance:.4f}")
    
    # 保存更新后的账号信息
    account_pool.save_accounts()
    
    return jsonify({
        "message": f"重置完成",
        "reset_accounts": reset_count,
        "default_balance": f"${default_balance:.4f}"
    })

@app.route('/v1/models', methods=['GET'])
def list_models():
    """列出支持的模型"""
    models = []
    for model_name, config in MODEL_MAPPING.items():
        models.append({
            "id": model_name,
            "object": "model",
            "created": int(time.time()),
            "owned_by": "freeplay",
            "max_tokens": config["max_tokens"],
            "model_id": config["model_id"]
        })
    
    return jsonify({
        "object": "list",
        "data": models
    })

@app.route('/test', methods=['GET'])
def test():
    """测试端点"""
    available_accounts = len([acc for acc in account_pool.accounts if acc['balance'] > 0.01])
    total_balance = sum(acc['balance'] for acc in account_pool.accounts)
    
    return jsonify({
        "status": "ok", 
        "message": "FreePlay2OpenAI API is running",
        "accounts_loaded": len(account_pool.accounts),
        "available_accounts": available_accounts,
        "total_balance": f"${total_balance:.4f}",
        "supported_models": list(MODEL_MAPPING.keys()),
        "default_model": "claude-3-7-sonnet-20250219",
        "endpoints": {
            "chat_completions": "/v1/chat/completions",
            "models": "/v1/models", 
            "accounts_status": "/accounts/status",
            "accounts_reload": "/accounts/reload",
            "update_balance": "/accounts/update-balance",
            "reset_disabled": "/accounts/reset-disabled"
        }
    })

if __name__ == '__main__':
    print("Starting FreePlay2OpenAI API server on http://localhost:8000")
    print(f"Loaded {len(account_pool.accounts)} accounts from {account_pool.accounts_file}")
    app.run(host='0.0.0.0', port=8000, debug=True)