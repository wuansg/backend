import { HostsUsageHistory } from '@prisma/client';

import { UniversalConverter } from '@common/converter/universalConverter';

import { HostsUsageHistoryEntity } from './entities';

const modelToEntity = (model: HostsUsageHistory): HostsUsageHistoryEntity => {
    return new HostsUsageHistoryEntity(model);
};

const entityToModel = (entity: HostsUsageHistoryEntity): HostsUsageHistory => {
    return {
        hostUuid: entity.hostUuid,
        nodeUuid: entity.nodeUuid,
        inboundTag: entity.inboundTag,
        downloadBytes: entity.downloadBytes,
        uploadBytes: entity.uploadBytes,
        totalBytes: entity.totalBytes,
        isShared: entity.isShared,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
};

export class HostsUsageHistoryConverter extends UniversalConverter<
    HostsUsageHistoryEntity,
    HostsUsageHistory
> {
    constructor() {
        super(modelToEntity, entityToModel);
    }
}
