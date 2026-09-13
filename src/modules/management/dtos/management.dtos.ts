import { createZodDto } from 'nestjs-zod';

import {
    BulkUpdateManagementTagsCommand,
    GetManagementTagsCommand,
    SearchManagementCatalogCommand,
    UpdateManagementTagsCommand,
} from '@libs/contracts/commands';

export class SearchManagementCatalogQueryDto extends createZodDto(
    SearchManagementCatalogCommand.RequestQuerySchema,
) {}
export class SearchManagementCatalogResponseDto extends createZodDto(
    SearchManagementCatalogCommand.ResponseSchema,
) {}
export class GetManagementTagsParamDto extends createZodDto(
    GetManagementTagsCommand.RequestParamSchema,
) {}
export class GetManagementTagsResponseDto extends createZodDto(
    GetManagementTagsCommand.ResponseSchema,
) {}
export class UpdateManagementTagsParamDto extends createZodDto(
    UpdateManagementTagsCommand.RequestParamSchema,
) {}
export class UpdateManagementTagsBodyDto extends createZodDto(
    UpdateManagementTagsCommand.RequestBodySchema,
) {}
export class UpdateManagementTagsResponseDto extends createZodDto(
    UpdateManagementTagsCommand.ResponseSchema,
) {}
export class BulkUpdateManagementTagsParamDto extends createZodDto(
    BulkUpdateManagementTagsCommand.RequestParamSchema,
) {}
export class BulkUpdateManagementTagsBodyDto extends createZodDto(
    BulkUpdateManagementTagsCommand.RequestBodySchema,
) {}
export class BulkUpdateManagementTagsResponseDto extends createZodDto(
    BulkUpdateManagementTagsCommand.ResponseSchema,
) {}
