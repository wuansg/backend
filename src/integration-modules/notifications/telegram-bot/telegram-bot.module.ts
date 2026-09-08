import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TELEGRAM_BOT_EVENTS } from './events';
import { TelegramApiService } from './telegram-api.service';
import { TelegramTargetHealthService } from './telegram-target-health.service';

@Module({
    imports: [ConfigModule],
    controllers: [],
    providers: [TelegramApiService, TelegramTargetHealthService, ...TELEGRAM_BOT_EVENTS],
    exports: [TelegramApiService, TelegramTargetHealthService],
})
export class TelegramBotModule {}
