import { CqrsModule } from '@nestjs/cqrs';
import { Module } from '@nestjs/common';

import { HostsModule } from '@modules/hosts/hosts.module';

import { HostsUsageHistoryRepository } from './repositories/hosts-usage-history.repository';
import { HostsUsageHistoryController } from './hosts-usage-history.controller';
import { HostsUsageHistoryConverter } from './hosts-usage-history.converter';
import { HostsUsageHistoryService } from './hosts-usage-history.service';
import { COMMANDS } from './commands';

@Module({
    imports: [CqrsModule, HostsModule],
    controllers: [HostsUsageHistoryController],
    providers: [
        HostsUsageHistoryService,
        HostsUsageHistoryRepository,
        HostsUsageHistoryConverter,
        ...COMMANDS,
    ],
    exports: [HostsUsageHistoryService],
})
export class HostsUsageHistoryModule {}
