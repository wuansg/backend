import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { HostsUsageHistoryRepository } from '../../repositories/hosts-usage-history.repository';
import { RecordUserHostUsageCommand } from './record-user-host-usage.command';

@CommandHandler(RecordUserHostUsageCommand)
export class RecordUserHostUsageHandler implements ICommandHandler<RecordUserHostUsageCommand> {
    private readonly logger = new Logger(RecordUserHostUsageHandler.name);

    constructor(private readonly hostsUsageHistoryRepository: HostsUsageHistoryRepository) {}

    async execute(command: RecordUserHostUsageCommand): Promise<void> {
        try {
            await this.hostsUsageHistoryRepository.recordNodeUserHostUsage(
                command.nodeUuid,
                command.userInbounds,
                command.createdAt,
            );
        } catch (error) {
            this.logger.error(error);
        }
    }
}
