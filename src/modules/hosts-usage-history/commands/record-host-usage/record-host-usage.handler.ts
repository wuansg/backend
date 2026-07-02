import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';

import { HostsUsageHistoryRepository } from '../../repositories/hosts-usage-history.repository';
import { RecordHostUsageCommand } from './record-host-usage.command';

@CommandHandler(RecordHostUsageCommand)
export class RecordHostUsageHandler implements ICommandHandler<RecordHostUsageCommand> {
    private readonly logger = new Logger(RecordHostUsageHandler.name);

    constructor(private readonly hostsUsageHistoryRepository: HostsUsageHistoryRepository) {}

    async execute(command: RecordHostUsageCommand): Promise<void> {
        try {
            await this.hostsUsageHistoryRepository.recordNodeHostUsage(
                command.nodeUuid,
                command.inbounds,
                command.createdAt,
            );
        } catch (error) {
            this.logger.error(error);
        }
    }
}
