import { createZodDto } from 'nestjs-zod';

import {
    AcknowledgeNodeGeocheckDriftCommand,
    GetNodeObservabilityCommand,
    UpdateNodeGeocheckCommand,
} from '@libs/contracts/commands';

export class GetNodeObservabilityParamDto extends createZodDto(
    GetNodeObservabilityCommand.RequestParamSchema,
) {}
export class GetNodeObservabilityResponseDto extends createZodDto(
    GetNodeObservabilityCommand.ResponseSchema,
) {}
export class UpdateNodeGeocheckParamDto extends createZodDto(
    UpdateNodeGeocheckCommand.RequestParamSchema,
) {}
export class UpdateNodeGeocheckBodyDto extends createZodDto(
    UpdateNodeGeocheckCommand.RequestBodySchema,
) {}
export class UpdateNodeGeocheckResponseDto extends createZodDto(
    UpdateNodeGeocheckCommand.ResponseSchema,
) {}
export class AcknowledgeNodeGeocheckDriftParamDto extends createZodDto(
    AcknowledgeNodeGeocheckDriftCommand.RequestParamSchema,
) {}
export class AcknowledgeNodeGeocheckDriftResponseDto extends createZodDto(
    AcknowledgeNodeGeocheckDriftCommand.ResponseSchema,
) {}
