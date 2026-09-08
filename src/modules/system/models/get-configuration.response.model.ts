interface INotificationsConfig {
    webhook: boolean;
    bandwidthUsage: number[] | null;
    notConnectedAfter: number[] | null;
    expirationNotifications: number[] | null;
    telegram: {
        enabled: boolean;
        targets: Array<{
            target: 'users' | 'nodes' | 'crm' | 'service' | 'tblocker';
            configured: boolean;
            available: boolean;
            circuitOpen: boolean;
            lastCheckedAt: string | null;
            lastSuccessAt: string | null;
            lastFailureAt: string | null;
            lastErrorKind:
                | 'none'
                | 'target_unavailable'
                | 'rate_limited'
                | 'transient'
                | 'rejected';
            nextProbeAt: string | null;
        }>;
    };
}

interface IServiceConfig {
    cleanUsageHistory: boolean;
    disableUserUsageRecords: boolean;
    disableSrhRecords: boolean;
    exportToRedisStream: boolean;
}

interface IMiscConfig {
    shortUuidLength: number;
    userUsageIgnoreBelowBytes: number;
    subPublicDomain: string;
}

export interface IGetConfigurationResponse {
    notifications: INotificationsConfig;
    service: IServiceConfig;
    misc: IMiscConfig;
}

export class GetConfigurationResponseModel implements IGetConfigurationResponse {
    notifications: INotificationsConfig;
    service: IServiceConfig;
    misc: IMiscConfig;

    constructor(data: IGetConfigurationResponse) {
        this.notifications = data.notifications;
        this.service = data.service;
        this.misc = data.misc;
    }
}
