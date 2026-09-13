import { z } from 'zod';

import { NODE_PLUGINS_ROUTES, REST_API } from '../../../api';
import { getEndpointDetails } from '../../../constants';

export namespace PreviewNodePluginCommand {
    export const url = REST_API.NODE_PLUGINS.ACTIONS.PREVIEW;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        NODE_PLUGINS_ROUTES.ACTIONS.PREVIEW,
        'post',
        'Compile and preview Node Plugin',
        { scope: 'preview', kind: 'read' },
        'Validates Shared List references and optionally compiles the generated nftables state on one node without applying it.',
    );

    export const RequestBodySchema = z.object({
        uuid: z.uuid().optional(),
        nodeUuid: z.uuid().optional(),
        pluginConfig: z.record(z.string(), z.unknown()),
    });

    export const ResponseSchema = z.object({ response: z.record(z.string(), z.unknown()) });

    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export type Response = z.infer<typeof ResponseSchema>;
}
