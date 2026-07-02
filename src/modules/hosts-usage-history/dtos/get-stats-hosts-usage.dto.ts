import { createZodDto } from 'nestjs-zod';

import { GetStatsHostsUsageCommand } from '@contract/commands';

export class GetStatsHostsUsageRequestQueryDto extends createZodDto(
    GetStatsHostsUsageCommand.RequestQuerySchema,
) {}
export class GetStatsHostsUsageResponseDto extends createZodDto(
    GetStatsHostsUsageCommand.ResponseSchema,
) {}
