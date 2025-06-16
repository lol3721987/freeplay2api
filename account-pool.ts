import type { Account } from './types.ts';
import { getAccountBalance } from './utils.ts';
import { ConfigManager } from './config-manager.ts';

export class AccountPool {
  private accounts: Account[] = [];
  private currentIndex: number = 0;
  private configManager: ConfigManager;

  constructor(configManager?: ConfigManager) {
    this.configManager = configManager || new ConfigManager();
  }

  /**
   * 从配置管理器加载账号信息
   */
  async loadAccounts(): Promise<void> {
    try {
      await this.configManager.loadConfig();
      this.accounts = this.configManager.getAccounts();
      console.log(`成功加载 ${this.accounts.length} 个账号`);
    } catch (error) {
      console.log(`加载账号配置时出错: ${error}`);
    }
  }

  /**
   * 更新单个账号的余额
   */
  async updateAccountBalance(account: Account): Promise<boolean> {
    try {
      const [newBalance, success] = await getAccountBalance(account.session_id);
      if (success) {
        const oldBalance = account.balance;
        account.balance = newBalance;
        console.log(`账号 ${account.email} 余额更新: $${oldBalance.toFixed(4)} -> $${newBalance.toFixed(4)}`);
        return true;
      } else {
        // 获取余额失败，将账号余额设置为0，避免再次被选中
        const oldBalance = account.balance;
        account.balance = 0.0;
        console.log(`账号 ${account.email} 余额更新失败，已禁用该账号 ($${oldBalance.toFixed(4)} -> $0.0000)`);
        return false;
      }
    } catch (error) {
      // 发生异常，同样将账号余额设置为0
      const oldBalance = account.balance;
      account.balance = 0.0;
      console.log(`更新账号 ${account.email} 余额时出错: ${error}，已禁用该账号 ($${oldBalance.toFixed(4)} -> $0.0000)`);
      return false;
    }
  }

  /**
   * 获取当前账号，如果余额不足则切换到下一个有余额的账号
   */
  async getCurrentAccount(): Promise<Account | null> {
    if (this.accounts.length === 0) {
      return null;
    }

    // 首先检查当前账号是否可用
    const currentAccount = this.accounts[this.currentIndex];
    console.log(`检查当前账号 ${currentAccount.email} (索引: ${this.currentIndex}, 余额: $${currentAccount.balance.toFixed(4)})`);

    // 如果当前账号余额充足，直接使用
    if (currentAccount.balance > 0.01) {
      console.log(`继续使用当前账号: ${currentAccount.email} (余额: $${currentAccount.balance.toFixed(4)})`);
      return currentAccount;
    }

    // 当前账号余额不足，寻找下一个可用账号
    console.log(`当前账号 ${currentAccount.email} 余额不足，寻找下一个可用账号...`);

    // 尝试所有账号，从下一个开始
    let attempts = 0;
    while (attempts < this.accounts.length) {
      // 移动到下一个账号
      this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
      const account = this.accounts[this.currentIndex];

      console.log(`尝试账号 ${account.email} (索引: ${this.currentIndex}, 当前余额: $${account.balance.toFixed(4)})`);

      // 如果账号余额大于0.01，更新余额并检查
      if (account.balance > 0.01) {
        console.log(`正在更新账号 ${account.email} 的余额...`);
        await this.updateAccountBalance(account);

        // 检查更新后的余额
        if (account.balance > 0.01) {
          console.log(`切换到新账号: ${account.email} (更新后余额: $${account.balance.toFixed(4)})`);
          return account;
        } else {
          console.log(`账号 ${account.email} 更新后余额不足，继续下一个账号`);
        }
      } else {
        console.log(`账号 ${account.email} 余额不足，跳过`);
      }

      attempts++;
    }

    console.log("警告: 所有账号都不可用");
    return null;
  }

  /**
   * 移动到下一个账号（用于错误重试时）
   */
  moveToNextAccount(): void {
    if (this.accounts.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
      console.log(`切换到下一个账号，当前索引: ${this.currentIndex}`);
    }
  }

  /**
   * 根据session_id获取账号
   */
  getAccountBySession(sessionId: string): Account | null {
    return this.accounts.find(account => account.session_id === sessionId) || null;
  }

  /**
   * 更新账号余额
   */
  updateBalance(sessionId: string, newBalance: number): void {
    const account = this.getAccountBySession(sessionId);
    if (account) {
      account.balance = newBalance;
    }
  }

  /**
   * 保存账号信息
   */
  async saveAccounts(): Promise<void> {
    try {
      await this.configManager.saveAccounts(this.accounts);
    } catch (error) {
      console.log(`保存账号配置时出错: ${error}`);
    }
  }

  /**
   * 获取所有账号
   */
  getAccounts(): Account[] {
    return [...this.accounts];
  }

  /**
   * 获取账号统计信息
   */
  getAccountStats(): {
    total: number;
    available: number;
    disabled: number;
    lowBalance: number;
    totalBalance: number;
  } {
    const total = this.accounts.length;
    const available = this.accounts.filter(acc => acc.balance > 0.01).length;
    const disabled = this.accounts.filter(acc => acc.balance === 0.0).length;
    const lowBalance = this.accounts.filter(acc => acc.balance > 0.0 && acc.balance <= 0.01).length;
    const totalBalance = this.accounts.reduce((sum, acc) => sum + acc.balance, 0);

    return {
      total,
      available,
      disabled,
      lowBalance,
      totalBalance
    };
  }

  /**
   * 重置被禁用的账号
   */
  async resetDisabledAccounts(defaultBalance: number = 5.0): Promise<number> {
    let resetCount = 0;
    for (const account of this.accounts) {
      if (account.balance === 0.0) {
        account.balance = defaultBalance;
        resetCount++;
        console.log(`重置账号 ${account.email} 余额: $0.0000 -> $${defaultBalance.toFixed(4)}`);
      }
    }

    // 保存更新后的账号信息
    await this.saveAccounts();
    return resetCount;
  }

  /**
   * 更新所有账号余额
   */
  async updateAllBalances(): Promise<{ updated: number; failed: number }> {
    let updatedCount = 0;
    let failedCount = 0;

    for (const account of this.accounts) {
      if (await this.updateAccountBalance(account)) {
        updatedCount++;
      } else {
        failedCount++;
      }
    }

    // 保存更新后的账号信息
    await this.saveAccounts();

    return {
      updated: updatedCount,
      failed: failedCount
    };
  }
} 