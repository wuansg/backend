import { dump, load } from 'js-yaml';
import { cloneDeep } from 'lodash';

import { Injectable, Logger } from '@nestjs/common';

import { fail, ok, TResult } from '@common/types';
import { PreviewHostSubscriptionCommand } from '@libs/contracts/commands';
import { ERRORS, RESET_PERIODS, USERS_STATUS } from '@libs/contracts/constants';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { HostsRepository } from '@modules/hosts/repositories/hosts.repository';
import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities';
import { UserEntity } from '@modules/users/entities';

import { MihomoGeneratorService } from './generators/mihomo.generator.service';
import { SingBoxGeneratorService } from './generators/singbox.generator.service';
import { XrayJsonGeneratorService } from './generators/xray-json.generator.service';
import { XrayGeneratorService } from './generators/xray.generator.service';
import { ResolvedProxyConfig } from './resolve-proxy/interfaces';
import { ResolveProxyConfigService } from './resolve-proxy/resolve-proxy-config.service';

type PreviewBody = PreviewHostSubscriptionCommand.RequestBody;
type PreviewResponse = PreviewHostSubscriptionCommand.Response['response'];

const PREVIEW_UUID = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class HostPreviewService {
    private readonly logger = new Logger(HostPreviewService.name);

    constructor(
        private readonly hostsRepository: HostsRepository,
        private readonly resolveProxyConfigService: ResolveProxyConfigService,
        private readonly singBoxGeneratorService: SingBoxGeneratorService,
        private readonly mihomoGeneratorService: MihomoGeneratorService,
        private readonly xrayJsonGeneratorService: XrayJsonGeneratorService,
        private readonly xrayGeneratorService: XrayGeneratorService,
    ) {}

    public async preview(dto: PreviewBody): Promise<TResult<PreviewResponse>> {
        try {
            const host = await this.resolveHost(dto.hostUuid);

            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            const [resolvedHost] = await this.resolveProxyConfigService.resolveProxyConfig({
                hosts: [host],
                subscriptionSettings: this.createPreviewSettings(),
                user: this.createPreviewUser(),
            });

            if (!resolvedHost) {
                return fail(
                    ERRORS.HOST_SUBSCRIPTION_PREVIEW_ERROR.withMessage(
                        'The selected inbound cannot be converted into a subscription host.',
                    ),
                );
            }

            const warnings = this.collectWarnings(resolvedHost, dto.templateType);
            const beforeHost = this.prepareHost(resolvedHost, {});
            const afterHost = this.prepareHost(
                resolvedHost,
                dto.mapper ?? resolvedHost.clientOverrides.mapper,
            );

            const beforeSubscription = await this.render(dto.templateType, beforeHost);
            const subscription = await this.render(dto.templateType, afterHost);

            if (!beforeSubscription || !subscription) {
                return fail(
                    ERRORS.HOST_SUBSCRIPTION_PREVIEW_ERROR.withMessage(
                        `The ${dto.templateType} generator did not produce a preview for this host.`,
                    ),
                );
            }

            const before = this.extractFragment(dto.templateType, beforeSubscription);
            const after = this.extractFragment(dto.templateType, subscription);

            return ok({
                templateType: dto.templateType,
                before,
                after,
                fragment: typeof after === 'string' ? after : this.formatFragment(after, dto),
                subscription,
                warnings,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown preview error';
            this.logger.error(`Failed to generate host subscription preview: ${message}`);

            return fail(ERRORS.HOST_SUBSCRIPTION_PREVIEW_ERROR.withMessage(message));
        }
    }

    private async resolveHost(uuid: string): Promise<HostWithRawInbound | null> {
        const host = await this.hostsRepository.findByUUID(uuid);

        if (!host?.configProfileInboundUuid) {
            return null;
        }

        const [inbound] = await this.hostsRepository.getInboundsByUuids([
            host.configProfileInboundUuid,
        ]);

        if (!inbound) {
            return null;
        }

        const [template] = host.xrayJsonTemplateUuid
            ? await this.hostsRepository.getTemplatesByUuids([host.xrayJsonTemplateUuid])
            : [];

        return new HostWithRawInbound({
            ...host,
            inboundTag: inbound.tag,
            rawInbound: inbound.rawInbound as object | null,
            xrayJsonTemplate: (template?.templateJson as object | null | undefined) ?? null,
        });
    }

    private prepareHost(
        source: ResolvedProxyConfig,
        mapper: ResolvedProxyConfig['clientOverrides']['mapper'],
    ): ResolvedProxyConfig {
        const host = cloneDeep(source);

        host.clientOverrides.mapper = mapper;
        host.metadata.excludeFromSubscriptionTypes = [];
        host.metadata.isDisabled = false;
        host.metadata.isHidden = false;

        return host;
    }

    private async render(
        templateType: PreviewBody['templateType'],
        host: ResolvedProxyConfig,
    ): Promise<string> {
        switch (templateType) {
            case 'SINGBOX':
                return await this.singBoxGeneratorService.generateConfig([host]);
            case 'MIHOMO':
                return await this.mihomoGeneratorService.generateConfig([host], false, false);
            case 'XRAY_JSON':
                return await this.xrayJsonGeneratorService.generateConfig({
                    hosts: [host],
                    isExtendedClient: false,
                    ignoreHostXrayJsonTemplate: false,
                });
            case 'XRAY_BASE64':
                return await this.xrayGeneratorService.generateConfig([host], false, false);
        }

        throw new Error(`Unsupported preview template type: ${String(templateType)}`);
    }

    private extractFragment(
        templateType: PreviewBody['templateType'],
        subscription: string,
    ): PreviewResponse['before'] {
        if (templateType === 'XRAY_BASE64') {
            const [link] = subscription.trim().split(/\r?\n/);
            if (!link) throw new Error('The Base64 generator produced no share link.');
            return link;
        }

        if (templateType === 'MIHOMO') {
            const config = load(subscription) as { proxies?: unknown[] } | null;
            const fragment = config?.proxies?.at(-1);
            if (fragment === undefined) throw new Error('The Mihomo generator produced no proxy.');
            return fragment as PreviewResponse['before'];
        }

        const config = JSON.parse(subscription) as
            | { outbounds?: unknown[] }
            | Array<{ outbounds?: unknown[] }>;

        if (templateType === 'SINGBOX') {
            const fragment = Array.isArray(config) ? undefined : config.outbounds?.at(-1);
            if (fragment === undefined)
                throw new Error('The sing-box generator produced no outbound.');
            return fragment as PreviewResponse['before'];
        }

        const fragment = Array.isArray(config) ? config[0]?.outbounds?.[0] : undefined;
        if (fragment === undefined)
            throw new Error('The Xray JSON generator produced no outbound.');
        return fragment as PreviewResponse['before'];
    }

    private formatFragment(value: PreviewResponse['after'], dto: PreviewBody): string {
        return dto.templateType === 'MIHOMO'
            ? dump(value, { noRefs: true, lineWidth: -1 }).trim()
            : JSON.stringify(value, null, 2);
    }

    private collectWarnings(
        host: ResolvedProxyConfig,
        templateType: PreviewBody['templateType'],
    ): string[] {
        const warnings: string[] = [];

        if (host.metadata.isDisabled) warnings.push('The host is disabled; preview forced it on.');
        if (host.metadata.isHidden) warnings.push('The host is hidden; preview forced it visible.');
        if (host.metadata.excludeFromSubscriptionTypes.includes(templateType)) {
            warnings.push(
                `The host currently excludes ${templateType}; preview ignored that exclusion.`,
            );
        }

        return warnings;
    }

    private createPreviewSettings(): SubscriptionSettingsEntity {
        return new SubscriptionSettingsEntity({
            uuid: PREVIEW_UUID,
            serveJsonAtBaseSubscription: false,
            isShowCustomRemarks: false,
            customRemarks: {},
            customResponseHeaders: null,
            randomizeHosts: false,
            responseRules: null,
            hwidSettings: { enabled: false, fallbackDeviceLimit: 0 },
            createdAt: new Date(0),
            updatedAt: new Date(0),
        });
    }

    private createPreviewUser(): UserEntity {
        return new UserEntity({
            id: 0n,
            shortUuid: 'preview000000000',
            username: 'preview',
            status: USERS_STATUS.ACTIVE,
            trafficLimitBytes: 0n,
            trafficLimitStrategy: RESET_PERIODS.NO_RESET,
            expireAt: new Date('2099-01-01T00:00:00.000Z'),
            subRevokedAt: null,
            lastTrafficResetAt: null,
            lastTriggeredThreshold: 0,
            trojanPassword: 'preview-trojan-password',
            vlessUuid: PREVIEW_UUID,
            ssPassword: 'cHJldmlldy1zaGFkb3dzb2Nrcy1wYXNzd29yZA==',
            anytlsPassword: 'preview-anytls-password',
            description: 'Host Mapper preview identity',
            tag: 'preview',
            telegramId: null,
            email: 'preview@example.invalid',
            hwidDeviceLimit: null,
            externalSquadUuid: null,
            createdAt: new Date(0),
            updatedAt: new Date(0),
            usedTrafficBytes: 0n,
            lifetimeUsedTrafficBytes: 0n,
            firstConnectedAt: null,
            onlineAt: null,
            lastConnectedNodeUuid: null,
            activeInternalSquads: [],
        });
    }
}
