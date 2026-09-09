import { z } from 'zod';

const SourcePathSchema = z
    .string()
    .min(1)
    .max(512)
    .meta({
        title: 'Source path',
        markdownDescription:
            'Dot-separated path in the raw inbound. Prefix it with `$host.` to read an allowed resolved host field.',
        examples: [
            'streamSettings.tlsSettings.cipherSuites',
            '$host.address',
            '$host.securityOptions.serverName',
        ],
    });

const buildTargetPathSchema = (target: string, examples: string[]) =>
    z
        .string()
        .min(1)
        .max(512)
        .meta({
            title: 'Target path',
            markdownDescription: `Dot-separated path in ${target}. Missing objects are created.`,
            examples,
        });

const buildOperationsSchema = (target: string, examples: string[]) => {
    const to = buildTargetPathSchema(target, examples);

    return z.discriminatedUnion('op', [
        z.object({
            op: z.literal('copy'),
            from: SourcePathSchema,
            to,
        }),
        z.object({
            op: z.literal('set'),
            to,
            value: z.union([
                z.string(),
                z.number(),
                z.boolean(),
                z.array(z.json()),
                z.record(z.string(), z.json()),
            ]),
        }),
        z.object({
            op: z.literal('unset'),
            to,
        }),
    ]);
};

export const XrayJsonHostMapperOperationsSchema = buildOperationsSchema(
    'the generated Xray outbound',
    ['streamSettings.tlsSettings.cipherSuites', 'mux'],
);

export const MihomoHostMapperOperationsSchema = buildOperationsSchema(
    'the generated Mihomo proxy node',
    ['ip-version', 'reality-opts.support-x25519mlkem768'],
);

export const Base64HostMapperOperationsSchema = buildOperationsSchema(
    'the generated share-link query string, or the link itself with a `$link.` prefix',
    [
        '$link.address',
        '$link.port',
        '$link.password',
        '$link.remark',
        '$link.method',
        'fp',
        'sni',
        'cs',
    ],
);

export const SingBoxHostMapperOperationsSchema = buildOperationsSchema(
    'the generated sing-box outbound',
    ['domain_resolver', 'multiplex.protocol', 'tls.utls.fingerprint'],
);

export const HostMapperOperationsSchema = XrayJsonHostMapperOperationsSchema;

export const HostMapperSchema = z
    .object({
        xrayJson: z.array(XrayJsonHostMapperOperationsSchema).optional(),
        mihomo: z.array(MihomoHostMapperOperationsSchema).optional(),
        base64: z.array(Base64HostMapperOperationsSchema).optional().meta({
            title: 'Base64',
            markdownDescription:
                'Plain targets edit query parameters. `$link.address`, `$link.port`, `$link.password`, `$link.remark`, and Shadowsocks `$link.method` rewrite the generated share link. Invalid address, port, password, or method values fall back to the generated value.',
        }),
        singbox: z.array(SingBoxHostMapperOperationsSchema).optional(),
    })
    .meta({
        title: 'Host Mapper',
        markdownDescription:
            'Applies ordered copy, set and unset operations after a client configuration has been generated.',
    });

export type THostMapper = z.infer<typeof HostMapperSchema>;
export type THostMapperOperation = z.infer<typeof HostMapperOperationsSchema>;
