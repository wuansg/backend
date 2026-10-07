import axios, { AxiosInstance } from 'axios';
import { ProxyAgent } from 'proxy-agent';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IInlineKeyboard } from '@queue/notifications/telegram-bot-logger/interfaces';

import { TelegramApiError } from './telegram-api.error';

type TelegramErrorBody = {
    error_code?: number;
    description?: string;
    parameters?: { retry_after?: number };
};

export interface TelegramRichReceipt {
    messageId?: number;
    nativeTableCount: number;
    returnedRichMessage: boolean;
}

@Injectable()
export class TelegramApiService {
    private readonly logger = new Logger(TelegramApiService.name);
    private readonly http: AxiosInstance;

    constructor(private readonly config: ConfigService) {
        const token = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
        const apiRoot = this.config.getOrThrow<string>('TELEGRAM_BOT_API_ROOT');
        const proxy = this.config.get<string>('TELEGRAM_BOT_PROXY');
        const agent = proxy ? new ProxyAgent({ getProxyForUrl: () => proxy }) : undefined;

        this.http = axios.create({
            baseURL: `${apiRoot}/bot${token}`,
            timeout: 10_000,
            httpAgent: agent,
            httpsAgent: agent,
        });
    }

    async sendMessage(
        chatId: string,
        text: string,
        opts?: {
            threadId?: number;
            keyboard?: IInlineKeyboard[];
            parseMode?: 'HTML' | 'MarkdownV2';
        },
    ): Promise<void> {
        const payload: Record<string, unknown> = {
            chat_id: chatId,
            text,
            parse_mode: opts?.parseMode ?? 'HTML',
            link_preview_options: { is_disabled: true },
        };

        if (opts?.threadId) payload.message_thread_id = opts.threadId;

        const reply_markup = this.buildReplyMarkup(opts?.keyboard);
        if (reply_markup) payload.reply_markup = reply_markup;

        try {
            await this.http.post('/sendMessage', payload);
        } catch (error) {
            throw this.toError(error);
        }
    }

    async sendRichMarkdown(
        chatId: string,
        markdown: string,
        opts?: { threadId?: number },
    ): Promise<TelegramRichReceipt> {
        const payload: Record<string, unknown> = {
            chat_id: chatId,
            rich_message: { markdown, skip_entity_detection: true },
        };
        if (opts?.threadId) payload.message_thread_id = opts.threadId;
        try {
            const { data } = await this.http.post('/sendRichMessage', payload);
            if (data.ok !== true) {
                const body = data as TelegramErrorBody;
                const status = body.error_code ?? 502;
                throw new TelegramApiError(
                    'Rich message request rejected',
                    body.parameters?.retry_after,
                    status,
                    status === 429 || status >= 500,
                    this.isTargetUnavailable(body.description ?? ''),
                );
            }
            // Return acceptance even if the receipt lacks formatting metadata: never
            // trigger a duplicate send after Telegram has accepted a message.
            const blocks = data.result?.rich_message?.blocks;
            return {
                messageId: data.result?.message_id,
                returnedRichMessage: Array.isArray(blocks),
                nativeTableCount: Array.isArray(blocks)
                    ? blocks.filter((block: { type?: string }) => block.type === 'table').length
                    : 0,
            };
        } catch (error) {
            if (error instanceof TelegramApiError) throw error;
            throw this.toError(error);
        }
    }

    async validateTarget(chatId: string): Promise<void> {
        try {
            await this.http.post('/getChat', { chat_id: chatId });
        } catch (error) {
            throw this.toError(error);
        }
    }

    public async healthcheck(): Promise<boolean> {
        try {
            const { data } = await this.http.get('/getMe');
            this.logger.log(
                `Telegram notifications enabled. Bot username: ${data.result?.username}`,
            );
            return data.ok === true;
        } catch (error) {
            this.logger.error(`Telegram getMe failed: ${this.toError(error).message}`);
            return false;
        }
    }

    private toError(error: unknown): TelegramApiError {
        if (!axios.isAxiosError(error)) {
            return new TelegramApiError(String(error));
        }

        if (!error.response) {
            return new TelegramApiError(
                `Network error: ${error.code ?? error.message}`,
                undefined,
                undefined,
                true,
            );
        }

        const body = error.response.data as TelegramErrorBody;
        const retryAfter =
            (body?.parameters?.retry_after ?? Number(error.response.headers['retry-after'])) ||
            undefined;

        const statusCode = error.response.status;
        const description = body?.description ?? 'request failed';
        const targetUnavailable = this.isTargetUnavailable(description);
        const retryable = statusCode === 429 || statusCode >= 500;

        return new TelegramApiError(
            `Telegram API ${statusCode}: ${description}`,
            retryAfter,
            statusCode,
            retryable,
            targetUnavailable,
        );
    }

    private isTargetUnavailable(description: string): boolean {
        return /chat not found|bot was blocked|user is deactivated|not enough rights|message thread not found/i.test(
            description,
        );
    }

    private buildReplyMarkup(keyboard?: IInlineKeyboard[]) {
        if (!keyboard?.length) return undefined;

        return {
            inline_keyboard: keyboard.map((item) => [
                {
                    text: item.text,
                    url: item.url,
                    ...(item.customEmoji && { icon_custom_emoji_id: item.customEmoji }),
                    ...(item.style && { style: item.style }),
                },
            ]),
        };
    }
}
