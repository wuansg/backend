import { createHmac } from 'node:crypto';
import semver from 'semver';

export function assertSnellAgentCompatibility(inbounds: { type: string }[], version: string): void {
    if (
        inbounds.some((inbound) => inbound.type === 'snell') &&
        (!semver.valid(version) || semver.lt(version, '3.14.0'))
    ) {
        throw new Error(
            'Managed Snell requires Remnanode >= 3.14.0 with the multi-PSK core patch.',
        );
    }
}

// Domain-separated credential: follows existing user credential revocation,
// without exposing or reusing the user's AnyTLS password on the wire.
export function getSnellPsk(user: { anytlsPassword: string }): string {
    if (!user.anytlsPassword) throw new Error('Missing user credential for Snell');
    return createHmac('sha256', user.anytlsPassword)
        .update('remnawave/snell/v5/psk')
        .digest('base64url');
}
