import { z } from 'zod';

import { ConfigProfileInboundsSchema } from './config-profile-inbounds.schema';

export const ConfigProfileSchema = z.object({
    uuid: z.uuid(),
    viewPosition: z.int(),
    name: z.string(),
    tags: z.array(z.string()).default([]),
    coreType: z.literal('SING_BOX').default('SING_BOX'),
    config: z.unknown(),
    inbounds: z.array(ConfigProfileInboundsSchema),
    nodes: z.array(
        z.object({
            uuid: z.uuid(),
            name: z.string(),
            countryCode: z.string(),
        }),
    ),

    createdAt: z.iso.datetime().transform((str) => new Date(str)),
    updatedAt: z.iso.datetime().transform((str) => new Date(str)),
});
