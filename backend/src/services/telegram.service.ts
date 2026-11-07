import axios, { AxiosInstance } from 'axios';
import * as qs from 'qs';

/**
 * Simple wrapper around the Telegram Bot API.
 * All methods are async and return the raw Telegram response.
 *
 * Environment variables (required):
 *   TELEGRAM_BOT_TOKEN   – Bot token (e.g. 123456:ABCdef...)
 *   TELEGRAM_WEBHOOK_SECRET – Secret token used to verify incoming webhook requests.
 *   TELEGRAM_BOT_USERNAME – Bot username (without the leading @) – used for deep‑link URLs.
 */
export class TelegramService {
  private readonly api: AxiosInstance | null = null;
  private readonly token: string | undefined;
  private readonly webhookSecret: string | undefined;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    this.token = token;
    this.webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (this.token) {
      this.api = axios.create({
        baseURL: `https://api.telegram.org/bot${this.token}`,
        timeout: 10_000,
      });
    } else {
      console.warn('[Telegram] TELEGRAM_BOT_TOKEN is not configured in .env');
    }
  }

  /**
   * Sends a text message to a chat.
   * By default it uses MarkdownV2 parsing (Telegram‑safe escaping applied).
   */
  async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      disableWebPagePreview?: boolean;
      silent?: boolean; // send as silent (no notification)
      replyMarkup?: any;
    },
  ): Promise<any> {
    if (!this.api || !this.token) {
      console.warn('[Telegram] Skipping message: TELEGRAM_BOT_TOKEN is not configured.');
      return null;
    }
    const payload = {
      chat_id: chatId,
      text: this.escapeMarkdown(text),
      parse_mode: options?.parseMode ?? 'MarkdownV2',
      disable_web_page_preview: options?.disableWebPagePreview ?? false,
      disable_notification: options?.silent ?? false,
      reply_markup: options?.replyMarkup,
    };
    const response = await this.api.post('/sendMessage', qs.stringify(payload, { arrayFormat: 'brackets' }));
    return response.data;
  }

  /**
   * Sets the webhook URL for this bot.
   * The secret token (if configured) is sent so Telegram can sign requests.
   */
  async setWebhook(url: string): Promise<any> {
    if (!this.api || !this.token) {
      console.warn('[Telegram] Cannot set webhook: TELEGRAM_BOT_TOKEN is not configured.');
      return null;
    }
    const payload: any = { url };
    if (this.webhookSecret) {
      payload.secret_token = this.webhookSecret;
    }
    const response = await this.api.post('/setWebhook', qs.stringify(payload));
    return response.data;
  }

  /**
   * Verifies that an incoming webhook request actually originates from Telegram.
   * Returns true when the secret token header matches the configured value.
   */
  verifyWebhook(req: any): boolean {
    if (!this.webhookSecret) {
      // No secret configured – accept all (legacy mode)
      return true;
    }
    const header = req.headers?.['x-telegram-bot-api-secret-token'];
    return header === this.webhookSecret;
  }

  /**
   * Escape characters that have special meaning in MarkdownV2.
   * This implementation covers the most common ones.
   */
  private escapeMarkdown(text: string): string {
    // Order matters – backslashes must be escaped first.
    return text
      .replace(/\\/g, '\\\\') // \ -> \\\
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/\-/g, '\\-')
      .replace(/\|/g, '\\|')
      .replace(/\{\}/g, '\\{\\}') // curly braces
      .replace(/\./g, '\\.');
  }
}

// Export a singleton for ease of use throughout the codebase.
export const telegramService = new TelegramService();

