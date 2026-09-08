export class TelegramApiError extends Error {
    constructor(
        message: string,
        readonly retryAfter?: number,
        readonly statusCode?: number,
        readonly retryable: boolean = true,
        readonly targetUnavailable: boolean = false,
    ) {
        super(message);
        this.name = 'TelegramApiError';
    }
}
