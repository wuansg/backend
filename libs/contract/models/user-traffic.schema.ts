import { z } from 'zod';

export const UserTrafficSchema = z.object({
    usedTrafficBytes: z.number(),
    lifetimeUsedTrafficBytes: z.number(),
    usedUploadTrafficBytes: z.number().default(0),
    usedDownloadTrafficBytes: z.number().default(0),
    lifetimeUploadTrafficBytes: z.number().default(0),
    lifetimeDownloadTrafficBytes: z.number().default(0),
    onlineAt: z.nullable(z.iso.datetime().transform((str) => new Date(str))),
    firstConnectedAt: z.nullable(z.iso.datetime().transform((str) => new Date(str))),
    lastConnectedNodeUuid: z.nullable(z.uuid()),
});
