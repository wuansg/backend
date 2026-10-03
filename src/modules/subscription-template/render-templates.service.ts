import { Injectable } from '@nestjs/common';

import { SUBSCRIPTION_CONFIG_TYPES } from './constants/config-types';
import { Base64GeneratorService } from './generators/base64.generator.service';
import { ClashGeneratorService } from './generators/clash.generator.service';
import { MihomoGeneratorService } from './generators/mihomo.generator.service';
import { SingBoxGeneratorService } from './generators/singbox.generator.service';
import { SurgeGeneratorService } from './generators/surge.generator.service';
import { IGenerateSubscription } from './interfaces';
import { ResolvedProxyConfig } from './resolve-proxy/interfaces';
import {
    IResolveProxyConfigOptions,
    ResolveProxyConfigService,
} from './resolve-proxy/resolve-proxy-config.service';

@Injectable()
export class RenderTemplatesService {
    constructor(
        private readonly resolveProxyConfigService: ResolveProxyConfigService,
        private readonly mihomoGeneratorService: MihomoGeneratorService,
        private readonly clashGeneratorService: ClashGeneratorService,
        private readonly surgeGeneratorService: SurgeGeneratorService,
        private readonly base64GeneratorService: Base64GeneratorService,
        private readonly singBoxGeneratorService: SingBoxGeneratorService,
    ) {}

    public async generateSubscription(params: IGenerateSubscription): Promise<{
        contentType: string;
        subscription: string;
    }> {
        const { srrContext, user, hosts, hostsOverrides, fallbackOptions } = params;

        const formattedHosts = await this.resolveProxyConfigService.resolveProxyConfig({
            subscriptionSettings: srrContext.subscriptionSettings,
            hosts,
            user,
            hostsOverrides,
            fallbackOptions,
            excludeHostsByTags: srrContext.excludeHostsByTags,
        });

        switch (srrContext.matchedResponseType) {
            case 'XRAY_BASE64':
                return {
                    subscription: await this.base64GeneratorService.generateConfig(
                        formattedHosts,
                        SUBSCRIPTION_CONFIG_TYPES['XRAY_BASE64'].isBase64,
                        srrContext.isExtendedClient,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['XRAY_BASE64'].CONTENT_TYPE,
                };

            case 'CLASH':
                return {
                    subscription: await this.clashGeneratorService.generateConfig(
                        formattedHosts,
                        srrContext.overrideTemplateName,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['CLASH'].CONTENT_TYPE,
                };

            case 'SURGE':
                return {
                    subscription: await this.surgeGeneratorService.generateConfig(
                        formattedHosts,
                        srrContext.overrideTemplateName,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['SURGE'].CONTENT_TYPE,
                };

            case 'MIHOMO':
                return {
                    subscription: await this.mihomoGeneratorService.generateConfig(
                        formattedHosts,
                        false,
                        srrContext.isExtendedClient,
                        srrContext.overrideTemplateName,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['MIHOMO'].CONTENT_TYPE,
                };

            case 'SINGBOX':
                return {
                    subscription: await this.singBoxGeneratorService.generateConfig(
                        formattedHosts,
                        srrContext.overrideTemplateName,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['SINGBOX'].CONTENT_TYPE,
                };

            case 'STASH':
                return {
                    subscription: await this.mihomoGeneratorService.generateConfig(
                        formattedHosts,
                        true,
                        false,
                        srrContext.overrideTemplateName,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['STASH'].CONTENT_TYPE,
                };

            default:
                return { subscription: '', contentType: '' };
        }
    }

    public async generateRawSubscription(
        options: IResolveProxyConfigOptions,
    ): Promise<ResolvedProxyConfig[]> {
        const { user, hosts, hostsOverrides, subscriptionSettings, fallbackOptions } = options;

        return await this.resolveProxyConfigService.resolveProxyConfig({
            subscriptionSettings,
            hosts,
            user,
            hostsOverrides,
            fallbackOptions,
        });
    }
}
