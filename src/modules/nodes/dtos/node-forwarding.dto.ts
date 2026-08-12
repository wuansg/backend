import {
    GetNodeForwardingCommand,
    SyncNodeForwardingCommand,
    UpdateNodeForwardingCommand,
} from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetNodeForwardingParamDto extends createZodDto(
    GetNodeForwardingCommand.RequestParamSchema,
) {}
export class GetNodeForwardingResponseDto extends createZodDto(
    GetNodeForwardingCommand.ResponseSchema,
) {}
export class UpdateNodeForwardingParamDto extends createZodDto(
    UpdateNodeForwardingCommand.RequestParamSchema,
) {}
export class UpdateNodeForwardingBodyDto extends createZodDto(
    UpdateNodeForwardingCommand.RequestBodySchema,
) {}
export class SyncNodeForwardingParamDto extends createZodDto(
    SyncNodeForwardingCommand.RequestParamSchema,
) {}
