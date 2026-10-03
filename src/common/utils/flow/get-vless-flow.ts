import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';

interface VlessSettingsWithFlow {
    settings: {
        flow: 'xtls-rprx-vision' | '' | 'none';
    };
}

export const hasVlessSettingsWithFlow = (obj: unknown): obj is VlessSettingsWithFlow => {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'settings' in obj &&
        typeof (obj as VlessSettingsWithFlow).settings === 'object' &&
        (obj as VlessSettingsWithFlow).settings !== null &&
        'flow' in (obj as VlessSettingsWithFlow).settings &&
        typeof (obj as VlessSettingsWithFlow).settings.flow === 'string'
    );
};

export function getVlessFlowFromDbInbound(
    inbound: ConfigProfileInboundEntity,
): 'xtls-rprx-vision' | '' {
    if (inbound.type === 'vless') {
        if (inbound.rawInbound && hasVlessSettingsWithFlow(inbound.rawInbound)) {
            if (inbound.rawInbound.settings.flow === 'xtls-rprx-vision') {
                return 'xtls-rprx-vision';
            } else {
                return '';
            }
        }
    }

    if (
        (inbound.network === 'tcp' || inbound.network === 'raw') &&
        (inbound.security === 'reality' || inbound.security === 'tls')
    ) {
        return 'xtls-rprx-vision';
    }

    return '';
}
