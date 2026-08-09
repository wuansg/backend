import { GetStatsHostsUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsHostsUsageRequestQueryDto extends createZodDto(
    GetStatsHostsUsageCommand.RequestQuerySchema,
) {}
export class GetStatsHostsUsageResponseDto extends createZodDto(
    GetStatsHostsUsageCommand.ResponseSchema,
) {}
