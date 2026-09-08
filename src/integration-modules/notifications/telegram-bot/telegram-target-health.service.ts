import { Injectable, Logger } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS } from '@libs/contracts/constants';

import {
    TELEGRAM_TARGETS,
    TTelegramTarget,
} from '@queue/notifications/telegram-bot-logger/interfaces';

import { TelegramApiError } from './telegram-api.error';
import { TelegramApiService } from './telegram-api.service';

const TARGET_CONFIG_KEYS = {
    users: 'TELEGRAM_NOTIFY_USERS',
    nodes: 'TELEGRAM_NOTIFY_NODES',
    crm: 'TELEGRAM_NOTIFY_CRM',
    service: 'TELEGRAM_NOTIFY_SERVICE',
    tblocker: 'TELEGRAM_NOTIFY_TBLOCKER',
} as const satisfies Record<TTelegramTarget, string>;
const CIRCUIT_OPEN_MS = 5 * 60 * 1_000;

export interface TelegramTargetStatus {
    target: TTelegramTarget;
    configured: boolean;
    available: boolean;
    circuitOpen: boolean;
    lastCheckedAt: string;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastErrorKind: 'none' | 'target_unavailable' | 'rate_limited' | 'transient' | 'rejected';
    nextProbeAt: string | null;
}

@Injectable()
export class TelegramTargetHealthService {
    private readonly logger = new Logger(TelegramTargetHealthService.name);

    constructor(
        private readonly config: TypedConfigService,
        private readonly rawCacheService: RawCacheService,
        private readonly telegramApiService: TelegramApiService,
    ) {}

    public async validateConfiguredTargets(): Promise<void> {
        await Promise.all(
            TELEGRAM_TARGETS.map(async (target) => {
                const configuredValue = this.config.get(TARGET_CONFIG_KEYS[target]);
                const chatId = configuredValue?.split(':')[0];
                if (!chatId) {
                    await this.writeStatus(target, {
                        configured: false,
                        available: false,
                        circuitOpen: false,
                        lastErrorKind: 'none',
                        nextProbeAt: null,
                    });
                    return;
                }

                try {
                    await this.telegramApiService.validateTarget(chatId);
                    await this.markSuccess(target);
                    this.logger.log(`Telegram target "${target}" is available.`);
                } catch (error) {
                    const telegramError = this.asTelegramError(error);
                    await this.markFailure(target, telegramError);
                    this.logger.warn(
                        `Telegram target "${target}" failed startup validation (${this.errorKind(telegramError)}).`,
                    );
                }
            }),
        );
    }

    public async canSend(target: TTelegramTarget): Promise<boolean> {
        const status = await this.getStatus(target);
        if (!status?.circuitOpen) return true;
        return status.nextProbeAt === null || Date.parse(status.nextProbeAt) <= Date.now();
    }

    public async markSuccess(target: TTelegramTarget): Promise<void> {
        const now = new Date().toISOString();
        await Promise.all([
            this.rawCacheService.increment(CACHE_KEYS.TELEGRAM_TARGET_SUCCESSES(target)),
            this.writeStatus(target, {
                configured: true,
                available: true,
                circuitOpen: false,
                lastSuccessAt: now,
                lastErrorKind: 'none',
                nextProbeAt: null,
            }),
        ]);
    }

    public async markFailure(target: TTelegramTarget, error: TelegramApiError): Promise<void> {
        const now = new Date();
        const targetUnavailable = error.targetUnavailable;
        await Promise.all([
            this.rawCacheService.increment(CACHE_KEYS.TELEGRAM_TARGET_FAILURES(target)),
            this.writeStatus(target, {
                configured: true,
                available: !targetUnavailable,
                circuitOpen: targetUnavailable,
                lastFailureAt: now.toISOString(),
                lastErrorKind: this.errorKind(error),
                nextProbeAt: targetUnavailable
                    ? new Date(now.getTime() + CIRCUIT_OPEN_MS).toISOString()
                    : null,
            }),
        ]);
    }

    public getStatus(target: TTelegramTarget): Promise<TelegramTargetStatus | null> {
        return this.rawCacheService.get<TelegramTargetStatus>(
            CACHE_KEYS.TELEGRAM_TARGET_STATUS(target),
        );
    }

    private async writeStatus(
        target: TTelegramTarget,
        patch: Partial<Omit<TelegramTargetStatus, 'target' | 'lastCheckedAt'>>,
    ): Promise<void> {
        const previous = await this.getStatus(target);
        const next: TelegramTargetStatus = {
            target,
            configured: false,
            available: false,
            circuitOpen: false,
            lastCheckedAt: new Date().toISOString(),
            lastSuccessAt: null,
            lastFailureAt: null,
            lastErrorKind: 'none',
            nextProbeAt: null,
            ...previous,
            ...patch,
        };
        next.target = target;
        next.lastCheckedAt = new Date().toISOString();
        await this.rawCacheService.set(CACHE_KEYS.TELEGRAM_TARGET_STATUS(target), next);
    }

    private asTelegramError(error: unknown): TelegramApiError {
        return error instanceof TelegramApiError ? error : new TelegramApiError(String(error));
    }

    private errorKind(error: TelegramApiError): TelegramTargetStatus['lastErrorKind'] {
        if (error.targetUnavailable) return 'target_unavailable';
        if (error.retryAfter) return 'rate_limited';
        if (error.retryable) return 'transient';
        return 'rejected';
    }
}
