import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RawCacheService } from '@common/raw-cache';
import { fail, ok } from '@common/types';
import { CACHE_KEYS, CACHE_KEYS_TTL, ERRORS } from '@libs/contracts/constants';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';

import { HostsRepository } from '../../repositories/hosts.repository';
import { GetHostsForUserQuery } from './get-hosts-for-user.query';

@QueryHandler(GetHostsForUserQuery)
export class GetHostsForUserHandler implements IQueryHandler<GetHostsForUserQuery> {
    private readonly logger = new Logger(GetHostsForUserHandler.name);
    constructor(
        private readonly hostsRepository: HostsRepository,
        private readonly rawCache: RawCacheService,
    ) {}

    async execute(query: GetHostsForUserQuery) {
        try {
            const hostsEntities = await this.hostsRepository.findActiveHostsByUserId(
                query.userId,
                query.returnDisabledHosts,
                query.returnHiddenHosts,
            );

            const inboundUuids = new Set<string>();

            for (const h of hostsEntities) {
                if (h.configProfileInboundUuid) inboundUuids.add(h.configProfileInboundUuid);
            }

            const inbounds = await this.rawCache.cachedByKeys([...inboundUuids], {
                cacheKey: CACHE_KEYS.RAW_INBOUND,
                ttlSeconds: CACHE_KEYS_TTL.RAW_INBOUND,
                fetch: (m) => this.hostsRepository.getInboundsByUuids(m),
                rowId: (r) => r.uuid,
                toValue: (r) => ({ rawInbound: r.rawInbound, tag: r.tag }),
            });

            return ok(
                hostsEntities.flatMap((h) => {
                    const inbound = h.configProfileInboundUuid
                        ? inbounds.get(h.configProfileInboundUuid)
                        : undefined;

                    if (!inbound) {
                        return [];
                    }

                    return new HostWithRawInbound({
                        ...h,
                        rawInbound: inbound.rawInbound,
                        inboundTag: inbound.tag,
                    });
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}
