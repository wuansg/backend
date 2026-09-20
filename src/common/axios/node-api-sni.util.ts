import { createHash, createPublicKey, X509Certificate } from 'node:crypto';

const NODE_API_SNI_PREFIX = 'rw-';
const NODE_API_SNI_SUFFIX = '.node.invalid';

export function formatNodeApiSni(caCertificateDer: Buffer, jwtPublicKeyDer: Buffer): string {
    const digest = createHash('sha256')
        .update(caCertificateDer)
        .update(jwtPublicKeyDer)
        .digest('hex');

    return `${NODE_API_SNI_PREFIX}${digest}${NODE_API_SNI_SUFFIX}`;
}

export function deriveNodeApiSni(caCertPem: string, jwtPrivateKeyPem: string): string {
    const caCertificateDer = new X509Certificate(caCertPem).raw;
    const jwtPublicKeyDer = createPublicKey(jwtPrivateKeyPem).export({
        type: 'spki',
        format: 'der',
    });

    return formatNodeApiSni(caCertificateDer, jwtPublicKeyDer);
}
