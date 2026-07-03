import { createZodDto } from 'nestjs-zod';

import { GetStatsUserHostsUsageCommand } from '@contract/commands';

export class GetStatsUserHostsUsageRequestQueryDto extends createZodDto(
    GetStatsUserHostsUsageCommand.RequestQuerySchema,
) {}

export class GetStatsUserHostsUsageRequestDto extends createZodDto(
    GetStatsUserHostsUsageCommand.RequestSchema,
) {}

export class GetStatsUserHostsUsageResponseDto extends createZodDto(
    GetStatsUserHostsUsageCommand.ResponseSchema,
) {}
