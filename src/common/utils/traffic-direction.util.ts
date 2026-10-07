import { Prisma } from '@prisma/client';

import { TrafficDirection } from '@libs/contracts/models';

export function trafficColumn(direction: TrafficDirection = 'total') {
    return ({ total: 'totalBytes', upload: 'uploadBytes', download: 'downloadBytes' } as const)[
        direction
    ];
}

// Only known identifiers may reach Prisma.raw; the query value itself is never interpolated.
export function trafficSqlColumn(direction: TrafficDirection = 'total'): Prisma.Sql {
    return Prisma.raw(
        ({ total: 'total_bytes', upload: 'upload_bytes', download: 'download_bytes' } as const)[
            direction
        ],
    );
}
