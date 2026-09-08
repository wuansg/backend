import { IInlineKeyboard } from './inline-keyboard.interface';

export const TELEGRAM_TARGETS = ['users', 'nodes', 'crm', 'service', 'tblocker'] as const;
export type TTelegramTarget = (typeof TELEGRAM_TARGETS)[number];

export interface IMessageEventPayload {
    message: string;
    chatId: string;
    threadId: string | undefined;
    target: TTelegramTarget;
    keyboard?: IInlineKeyboard[];
}
