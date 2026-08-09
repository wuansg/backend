import { z } from 'zod';

import { ConfigProfileInboundsSchema } from './config-profile-inbounds.schema';

export const InternalSquadInboundSchema = ConfigProfileInboundsSchema.extend({
    nodes: z.array(
        z.object({
            uuid: z.string().uuid(),
            name: z.string(),
            countryCode: z.string(),
        }),
    ),
});

export const InternalSquadSchema = z.object({
    uuid: z.uuid(),
    viewPosition: z.int(),
    name: z.string(),

    info: z.object({
        membersCount: z.number(),
        inboundsCount: z.number(),
    }),

    inbounds: z.array(InternalSquadInboundSchema),

    createdAt: z.iso.datetime().transform((str) => new Date(str)),
    updatedAt: z.iso.datetime().transform((str) => new Date(str)),
});
