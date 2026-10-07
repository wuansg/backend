import { z } from 'zod';

import { BenchmarkTargetSchema } from '@libs/contracts/commands';
type Target = z.infer<typeof BenchmarkTargetSchema>;
const libre = (id: Target['id'], city: string, host: string): Target => ({
    id,
    city,
    provider: 'Clouvider',
    downloadUrl: `https://${host}.speedtest.clouvider.net/backend/garbage.php`,
    uploadUrl: `https://${host}.speedtest.clouvider.net/backend/empty.php`,
    policyUrl: 'https://librespeed.org/backend-servers/servers.php',
});
const vultr = (id: Target['id'], city: string, host: string): Target => ({
    id,
    city,
    provider: 'Vultr',
    downloadUrl: `https://${host}.vultr.com/vultr.com.100MB.bin`,
    uploadUrl: '',
    policyUrl: `https://${host}.vultr.com/`,
});
export const DEFAULT_BENCHMARK_TARGETS: Target[] = [
    {
        id: 'hong-kong',
        city: 'Hong Kong',
        provider: 'Simcentric',
        downloadUrl: 'http://216.118.254.42/100M.bin',
        uploadUrl: '',
        policyUrl: 'https://www.simcentric.com/looking-glass/',
    },
    vultr('singapore', 'Singapore', 'sgp-ping'),
    vultr('tokyo', 'Tokyo', 'hnd-jp-ping'),
    vultr('osaka', 'Osaka', 'osk-jp-ping'),
    libre('los-angeles', 'Los Angeles', 'la'),
    vultr('seattle', 'Seattle', 'wa-us-ping'),
    vultr('dallas', 'Dallas', 'tx-us-ping'),
    libre('new-york', 'New York', 'nyc'),
    libre('london', 'London', 'lon'),
    libre('frankfurt', 'Frankfurt', 'fra'),
    libre('amsterdam', 'Amsterdam', 'ams'),
    vultr('paris', 'Paris', 'par-fr-ping'),
];
