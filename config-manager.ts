import type { Account } from './types.ts';

export interface AccountConfig {
  email: string;
  password: string;
  session_id: string;
  project_id: string;
  balance: number;
}

export interface AppConfig {
  accounts: AccountConfig[];
  port: number;
  default_balance: number;
}

export class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = {
      accounts: [],
      port: 8000,
      default_balance: 5.0
    };
  }

  /**
   * 加载配置，按优先级：环境变量 > JSON文件 > TXT文件
   */
  async loadConfig(): Promise<void> {
    console.log("加载配置中...");

    // 优先级1: 环境变量中的JSON配置
    if (await this.loadFromEnvironment()) {
      console.log("从环境变量加载配置成功");
      return;
    }

    // 优先级2: JSON配置文件
    if (await this.loadFromJsonFile()) {
      console.log("从JSON文件加载配置成功");
      return;
    }

    // 优先级3: 传统TXT文件（向后兼容）
    if (await this.loadFromTxtFile()) {
      console.log("从TXT文件加载配置成功");
      return;
    }

    console.warn("未找到有效的配置源，使用默认配置");
  }

  /**
   * 从环境变量加载配置
   */
  private async loadFromEnvironment(): Promise<boolean> {
    try {
      const accountsJson = Deno.env.get("ACCOUNTS_JSON");
      if (!accountsJson) {
        return false;
      }

      const envConfig = JSON.parse(accountsJson);
      if (this.validateConfig(envConfig)) {
        this.config = { ...this.config, ...envConfig };
        console.log(`从环境变量加载 ${this.config.accounts.length} 个账号`);
        return true;
      }
    } catch (error) {
      console.error(`环境变量配置解析失败: ${error}`);
    }
    return false;
  }

  /**
   * 从JSON文件加载配置
   */
  private async loadFromJsonFile(): Promise<boolean> {
    try {
      const configFiles = ['accounts.json', 'config.json'];
      
      for (const file of configFiles) {
        try {
          const content = await Deno.readTextFile(file);
          const fileConfig = JSON.parse(content);
          
          if (this.validateConfig(fileConfig)) {
            this.config = { ...this.config, ...fileConfig };
            console.log(`从${file}加载 ${this.config.accounts.length} 个账号`);
            return true;
          }
        } catch {
          // 文件不存在或格式错误，继续尝试下一个
          continue;
        }
      }
    } catch (error) {
      console.error(`JSON文件配置加载失败: ${error}`);
    }
    return false;
  }

  /**
   * 从TXT文件加载配置（向后兼容）
   */
  private async loadFromTxtFile(): Promise<boolean> {
    try {
      const content = await Deno.readTextFile("accounts.txt");
      const lines = content.split('\n');
      const accounts: AccountConfig[] = [];

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum].trim();
        if (!line) continue;

        const parts = line.split('----');
        if (parts.length >= 5) {
          const account: AccountConfig = {
            email: parts[0],
            password: parts[1],
            session_id: parts[2],
            project_id: parts[3],
            balance: parseFloat(parts[4]) || 0.0
          };
          accounts.push(account);
        } else {
          console.warn(`第${lineNum + 1}行格式不正确: ${line}`);
        }
      }

      if (accounts.length > 0) {
        this.config.accounts = accounts;
        console.log(`从accounts.txt加载 ${accounts.length} 个账号`);
        return true;
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log("accounts.txt 文件不存在");
      } else {
        console.error(`TXT文件配置加载失败: ${error}`);
      }
    }
    return false;
  }

  /**
   * 验证配置格式
   */
  private validateConfig(config: any): boolean {
    if (!config || typeof config !== 'object') {
      return false;
    }

    if (!Array.isArray(config.accounts)) {
      return false;
    }

    // 验证每个账号的必需字段
    for (const account of config.accounts) {
      if (!account.email || !account.session_id || !account.project_id) {
        console.error("账号配置缺少必需字段:", account);
        return false;
      }
    }

    return true;
  }

  /**
   * 获取配置
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * 获取账号列表
   */
  getAccounts(): Account[] {
    return this.config.accounts.map(acc => ({
      email: acc.email,
      password: acc.password || '',
      session_id: acc.session_id,
      project_id: acc.project_id,
      balance: acc.balance || 0.0
    }));
  }

  /**
   * 获取端口配置
   */
  getPort(): number {
    const envPort = Deno.env.get("PORT");
    return envPort ? parseInt(envPort) : this.config.port;
  }

  /**
   * 保存账号配置到对应格式
   */
  async saveAccounts(accounts: Account[]): Promise<void> {
    try {
      // 更新内存中的配置
      this.config.accounts = accounts.map(acc => ({
        email: acc.email,
        password: acc.password,
        session_id: acc.session_id,
        project_id: acc.project_id,
        balance: acc.balance
      }));

      // 如果有环境变量配置，不保存到文件
      if (Deno.env.get("ACCOUNTS_JSON")) {
        console.log("检测到环境变量配置，跳过文件保存");
        return;
      }

      // 尝试保存到JSON文件
      if (await this.fileExists('accounts.json') || await this.fileExists('config.json')) {
        const configFile = await this.fileExists('accounts.json') ? 'accounts.json' : 'config.json';
        await Deno.writeTextFile(configFile, JSON.stringify({ accounts: this.config.accounts }, null, 2));
        console.log(`配置已保存到 ${configFile}`);
        return;
      }

      // 回退到TXT格式
      const lines = accounts.map(account => 
        `${account.email}----${account.password}----${account.session_id}----${account.project_id}----${account.balance.toFixed(4)}`
      );
      await Deno.writeTextFile('accounts.txt', lines.join('\n') + '\n');
      console.log("配置已保存到 accounts.txt");
    } catch (error) {
      console.error(`保存配置失败: ${error}`);
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filename: string): Promise<boolean> {
    try {
      await Deno.stat(filename);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 生成配置示例
   */
  generateConfigExample(): string {
    const example = {
      accounts: [
        {
          email: "user1@example.com",
          password: "password123",
          session_id: "abcd1234efgh5678",
          project_id: "12345678-abcd-1234-efgh-123456789012",
          balance: 5.0
        },
        {
          email: "user2@example.com", 
          password: "password456",
          session_id: "ijkl5678mnop9012",
          project_id: "87654321-dcba-4321-hgfe-210987654321",
          balance: 3.25
        }
      ],
      port: 8000,
      default_balance: 5.0
    };

    return JSON.stringify(example, null, 2);
  }
} 