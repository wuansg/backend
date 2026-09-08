import { ERRORS } from '@contract/constants';
import {
    NodeForwardingConfig,
    NodeForwardingConfigSchema,
    NodeForwardingIPv4Schema,
    NodeForwardingRuntimeStatus,
} from '@contract/models';

import { Injectable, Logger } from '@nestjs/common';

import { AxiosService, INodeConnectionOpts } from '@common/axios';
import { fail, ok, TResult } from '@common/types';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';

import { hashNodeForwardingConfig } from '@queue/_nodes/forwarding-sync.util';

import { NodesEntity } from '../entities';
import { NodesRepository } from '../repositories/nodes.repository';

const FORWARDING_CAPABILITY = 'port_forwarding_v1';
const FORWARDING_DNS_CAPABILITY = 'port_forwarding_dns_v1';
const DEFAULT_CONFIG: NodeForwardingConfig = {
    enabled: false,
    listenInterface: 'auto',
    rules: [],
};

export interface NodeForwardingView {
    config: NodeForwardingConfig;
    status: NodeForwardingRuntimeStatus;
}

@Injectable()
export class NodeForwardingService {
    private readonly logger = new Logger(NodeForwardingService.name);
    private jwtReady?: Promise<void>;

    constructor(
        private readonly nodesRepository: NodesRepository,
        private readonly axios: AxiosService,
    ) {}

    public async get(uuid: string): Promise<TResult<NodeForwardingView>> {
        const node = await this.nodesRepository.findByUUID(uuid);
        if (!node) return fail(ERRORS.NODE_NOT_FOUND);

        const config = this.readConfig(node);
        return ok({ config, status: await this.readRuntimeStatus(node, config) });
    }

    public async update(
        uuid: string,
        config: NodeForwardingConfig,
    ): Promise<TResult<NodeForwardingView>> {
        const node = await this.nodesRepository.findByUUID(uuid);
        if (!node) return fail(ERRORS.NODE_NOT_FOUND);

        const validationError = this.validateStatic(node, config);
        if (validationError) {
            return fail(ERRORS.FORWARDING_PORT_CONFLICT.withMessage(validationError));
        }

        const previous = this.readConfig(node);
        const capability = await this.capabilityState(node, config);
        if (capability === 'unsupported' && this.requiresDNSCapability(config)) {
            return fail(ERRORS.FORWARDING_APPLY_ERROR.withMessage(this.unsupportedMessage(config)));
        }
        if (capability === 'supported') {
            const validation = await this.axios.validateNodeForwarding(
                config,
                this.connectionOptions(node),
            );
            if (!validation.isOk && validation.code === 'FORWARDING_PORT_CONFLICT') {
                return fail(ERRORS.FORWARDING_PORT_CONFLICT.withMessage(validation.message));
            }
            if (!validation.isOk) {
                return fail(ERRORS.FORWARDING_APPLY_ERROR.withMessage(validation.message));
            }
        }

        const updated = await this.nodesRepository.updateForwardingConfig(uuid, config);
        if (!updated) return fail(ERRORS.UPDATE_NODE_ERROR);

        if (capability === 'supported') {
            const applied = await this.axios.syncNodeForwarding(
                config,
                this.connectionOptions(updated),
            );
            if (!applied.isOk && applied.code === 'FORWARDING_PORT_CONFLICT') {
                await this.nodesRepository.updateForwardingConfig(uuid, previous);
                return fail(ERRORS.FORWARDING_PORT_CONFLICT.withMessage(applied.message));
            }
            if (!applied.isOk) {
                return ok({
                    config,
                    status: this.statusWithDesiredHash(config, {
                        state: 'error',
                        lastError: applied.message,
                        rules: [],
                    }),
                });
            }
            return ok({ config, status: this.statusWithDesiredHash(config, applied.response) });
        }

        return ok({
            config,
            status: this.statusWithDesiredHash(config, {
                state: capability === 'unsupported' ? 'unsupported' : 'pending',
                lastError:
                    capability === 'unsupported'
                        ? this.unsupportedMessage(config)
                        : 'Node is unreachable; configuration will be synchronized when it reconnects',
                rules: [],
            }),
        });
    }

    public async sync(uuid: string): Promise<TResult<NodeForwardingView>> {
        const node = await this.nodesRepository.findByUUID(uuid);
        if (!node) return fail(ERRORS.NODE_NOT_FOUND);
        const config = this.readConfig(node);
        const capability = await this.capabilityState(node, config);
        if (capability !== 'supported') {
            return fail(
                ERRORS.FORWARDING_APPLY_ERROR.withMessage(
                    capability === 'unsupported'
                        ? this.unsupportedMessage(config)
                        : 'Node is unreachable',
                ),
            );
        }
        const applied = await this.axios.syncNodeForwarding(config, this.connectionOptions(node));
        if (!applied.isOk) {
            if (applied.code === 'FORWARDING_PORT_CONFLICT') {
                return fail(ERRORS.FORWARDING_PORT_CONFLICT.withMessage(applied.message));
            }
            return fail(ERRORS.FORWARDING_APPLY_ERROR.withMessage(applied.message));
        }
        return ok({ config, status: this.statusWithDesiredHash(config, applied.response) });
    }

    public async syncForNode(node: NodesEntity): Promise<void> {
        const config = this.readConfig(node);
        if ((await this.capabilityState(node, config)) !== 'supported') return;
        const response = await this.axios.syncNodeForwarding(config, this.connectionOptions(node));
        if (!response.isOk) {
            this.logger.warn(
                `Failed to synchronize forwarding for node ${node.uuid}: ${response.message}`,
            );
        }
    }

    public validateNodeInbounds(
        node: NodesEntity,
        inbounds: ConfigProfileInboundEntity[],
        nodeAddress = node.address,
    ): string | null {
        return this.validateConfig(nodeAddress, inbounds, this.readConfig(node));
    }

    private async readRuntimeStatus(
        node: NodesEntity,
        config: NodeForwardingConfig,
    ): Promise<NodeForwardingRuntimeStatus> {
        const capability = await this.capabilityState(node, config);
        if (capability !== 'supported') {
            return this.statusWithDesiredHash(config, {
                state: capability === 'unsupported' ? 'unsupported' : 'unreachable',
                lastError:
                    capability === 'unsupported'
                        ? this.unsupportedMessage(config)
                        : 'Unable to reach Remnawave Node',
                rules: [],
            });
        }
        const status = await this.axios.getNodeForwardingStatus(this.connectionOptions(node));
        if (!status.isOk) {
            return this.statusWithDesiredHash(config, {
                state: 'unreachable',
                lastError: status.message,
                rules: [],
            });
        }
        return this.statusWithDesiredHash(config, status.response);
    }

    private async capabilityState(
        node: NodesEntity,
        config: NodeForwardingConfig,
    ): Promise<'supported' | 'unsupported' | 'unreachable'> {
        try {
            await this.ensureJwt();
        } catch (error) {
            this.logger.error(`Failed to initialize node mTLS client: ${error}`);
            return 'unreachable';
        }
        const health = await this.axios.getNodeHealth(this.connectionOptions(node));
        if (!health.isOk) return 'unreachable';
        const capabilities = (health.response as unknown as { capabilities?: string[] })
            .capabilities;
        if (!capabilities?.includes(FORWARDING_CAPABILITY)) return 'unsupported';
        if (
            this.requiresDNSCapability(config) &&
            !capabilities.includes(FORWARDING_DNS_CAPABILITY)
        ) {
            return 'unsupported';
        }
        return 'supported';
    }

    private requiresDNSCapability(config: NodeForwardingConfig): boolean {
        return config.rules.some(
            (rule) => !NodeForwardingIPv4Schema.safeParse(rule.targetAddress).success,
        );
    }

    private unsupportedMessage(config: NodeForwardingConfig): string {
        return this.requiresDNSCapability(config)
            ? 'Hostname forwarding requires Remnawave Node >= 3.3.0 with port_forwarding_dns_v1'
            : 'Remnawave Node does not advertise port_forwarding_v1; upgrade to >= 3.2.0';
    }

    private ensureJwt(): Promise<void> {
        this.jwtReady ??= this.axios.setJwt();
        return this.jwtReady;
    }

    private readConfig(node: NodesEntity): NodeForwardingConfig {
        const parsed = NodeForwardingConfigSchema.safeParse(node.forwardingConfig);
        return parsed.success ? parsed.data : structuredClone(DEFAULT_CONFIG);
    }

    private validateStatic(node: NodesEntity, config: NodeForwardingConfig): string | null {
        return this.validateConfig(node.address, node.activeInbounds, config);
    }

    private validateConfig(
        nodeAddress: string,
        inbounds: ConfigProfileInboundEntity[],
        config: NodeForwardingConfig,
    ): string | null {
        const enabledRules = config.enabled ? config.rules.filter((rule) => rule.enabled) : [];
        for (let i = 0; i < enabledRules.length; i++) {
            const left = enabledRules[i];
            for (const right of enabledRules.slice(i + 1)) {
                if (
                    left.listenPort === right.listenPort &&
                    this.protocolsOverlap(left.protocol, right.protocol)
                ) {
                    return `${left.protocol}/${left.listenPort} conflicts with forwarding rule ${right.name}`;
                }
            }
            if (nodeAddress === left.targetAddress) {
                return `${left.protocol}/${left.listenPort} targets the same node address`;
            }
            for (const inbound of inbounds) {
                if (
                    inbound.port === left.listenPort &&
                    this.protocolsOverlap(left.protocol, this.inboundProtocol(inbound))
                ) {
                    return `${left.protocol}/${left.listenPort} conflicts with core inbound ${inbound.tag}`;
                }
            }
        }
        return null;
    }

    private inboundProtocol(inbound: ConfigProfileInboundEntity): 'TCP' | 'UDP' | 'TCP_UDP' {
        const network = inbound.network?.toLowerCase();
        if (network === 'quic' || network === 'kcp' || network === 'udp') return 'UDP';
        if (
            network === 'tcp' ||
            network === 'raw' ||
            network === 'ws' ||
            network === 'grpc' ||
            network === 'httpupgrade' ||
            network === 'splithttp' ||
            network === 'xhttp'
        ) {
            return 'TCP';
        }
        const type = inbound.type.toLowerCase();
        if (['hysteria', 'hysteria2', 'tuic', 'quic'].includes(type)) return 'UDP';
        if (['anytls', 'trojan', 'vless', 'http', 'naive', 'shadowtls'].includes(type)) {
            return 'TCP';
        }
        return 'TCP_UDP';
    }

    private protocolsOverlap(left: string, right: string): boolean {
        return left === 'TCP_UDP' || right === 'TCP_UDP' || left === right;
    }

    private statusWithDesiredHash(
        config: NodeForwardingConfig,
        status: NodeForwardingRuntimeStatus,
    ): NodeForwardingRuntimeStatus {
        const desiredHash = hashNodeForwardingConfig(config);
        if (
            status.state !== 'error' &&
            status.state !== 'degraded' &&
            status.state !== 'unsupported' &&
            status.state !== 'unreachable' &&
            status.appliedHash !== desiredHash
        ) {
            status = { ...status, state: 'pending' };
        }
        return { ...status, desiredHash };
    }

    private connectionOptions(node: NodesEntity): INodeConnectionOpts {
        return { address: node.address, port: node.port, proxyUrl: node.proxyUrl };
    }
}
