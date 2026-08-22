import { z } from 'zod';

import { REST_API, SUBSCRIPTION_TEMPLATE_ROUTES } from '../../../api';
import { SUBSCRIPTION_TEMPLATE_TYPE, getEndpointDetails } from '../../../constants';
import { HostMapperSchema } from '../../../models';

const PreviewTemplateTypeSchema = z.enum([
    SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX,
    SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO,
    SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON,
    SUBSCRIPTION_TEMPLATE_TYPE.XRAY_BASE64,
]);

export namespace PreviewHostSubscriptionCommand {
    export const url = REST_API.SUBSCRIPTION_TEMPLATE.ACTIONS.PREVIEW_HOST;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTION_TEMPLATE_ROUTES.ACTIONS.PREVIEW_HOST,
        'post',
        'Preview a generated host before and after Host Mapper operations',
        { scope: 'preview-host', kind: 'read' },
    );

    export const RequestBodySchema = z.object({
        hostUuid: z.uuid(),
        mapper: HostMapperSchema.optional(),
        templateType: PreviewTemplateTypeSchema,
    });

    export const ResponseSchema = z.object({
        response: z.object({
            templateType: PreviewTemplateTypeSchema,
            before: z.json(),
            after: z.json(),
            fragment: z.string(),
            subscription: z.string(),
            warnings: z.array(z.string()),
        }),
    });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
