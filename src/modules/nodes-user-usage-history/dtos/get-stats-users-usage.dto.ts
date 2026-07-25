import { GetStatsUsersUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsUsersUsageRequestQueryDto extends createZodDto(
    GetStatsUsersUsageCommand.RequestQuerySchema,
) {}

export class GetStatsUsersUsageResponseDto extends createZodDto(
    GetStatsUsersUsageCommand.ResponseSchema,
) {}
