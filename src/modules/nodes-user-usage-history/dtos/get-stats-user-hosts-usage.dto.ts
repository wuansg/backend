import { GetStatsUserHostsUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsUserHostsUsageRequestQueryDto extends createZodDto(
    GetStatsUserHostsUsageCommand.RequestQuerySchema,
) {}

export class GetStatsUserHostsUsageRequestDto extends createZodDto(
    GetStatsUserHostsUsageCommand.RequestSchema,
) {}

export class GetStatsUserHostsUsageResponseDto extends createZodDto(
    GetStatsUserHostsUsageCommand.ResponseSchema,
) {}
