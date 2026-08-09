import { GetStatsHostUsersUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsHostUsersUsageRequestQueryDto extends createZodDto(
    GetStatsHostUsersUsageCommand.RequestQuerySchema,
) {}

export class GetStatsHostUsersUsageRequestDto extends createZodDto(
    GetStatsHostUsersUsageCommand.RequestSchema,
) {}

export class GetStatsHostUsersUsageResponseDto extends createZodDto(
    GetStatsHostUsersUsageCommand.ResponseSchema,
) {}
