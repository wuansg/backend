import type {
    NodeForwardingConfig,
    NodeForwardingRuntimeStatus,
    TNodeRuntimeStatus,
    TNodeSystem,
} from '@contract/models';

import { ERRORS } from '@contract/constants';
import axios, {
    AxiosError,
    AxiosInstance,
    AxiosRequestConfig,
    AxiosResponse,
    RawAxiosRequestHeaders,
} from 'axios';
import https from 'node:https';
import { promisify } from 'node:util';
import { constants as zlibConstants, zstdCompress, ZstdOptions } from 'node:zlib';

import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

import {
    AddUserCommand,
    AddUsersCommand,
    BlockIpsCommand,
    DropIpsCommand,
    DropUsersConnectionsCommand,
    GetCombinedStatsCommand,
    GetGeocheckCommand,
    GetUserIpListCommand,
    GetUsersIpListCommand,
    GetUsersStatsCommand,
    RecreateTablesCommand,
    RemoveUserCommand,
    RemoveUsersCommand,
    SyncCommand,
    UnblockIpsCommand,
} from '@remnawave/node-contract';

import { prettyBytesUtil } from '@common/utils/bytes';
import { formatExecutionTime, getTime } from '@common/utils/get-elapsed-time';

import { GetNodeJwtCommand } from '@modules/keygen/commands/get-node-jwt';

import { fail, ok, TResult } from '../types';
import { INodeConnectionOpts, INodeRequestOpts, IMtlsOptions } from './axios.interfaces';
import { MtlsSocksProxyAgent } from './mtls-agent';
import { retryTransient } from './transient-retry';

type CoreStartRequest = {
    coreType: 'SING_BOX';
    singBoxConfig: Record<string, unknown>;
    internals: {
        metadata?: {
            name: string;
            uuid: string;
            id: number;
            tags: string[];
            countryCode: string;
        };
        integrations?: Record<string, unknown>;
        forceRestart?: boolean;
        hashes: {
            emptyConfig: string;
            inbounds: Array<{ usersCount: number; hash: string; tag: string }>;
        };
    };
};

type CoreStartResponse = {
    response: {
        isStarted: boolean;
        version: string | null;
        error: string | null;
        nodeInformation: { version: string | null };
        system: TNodeSystem;
        runningCore?: 'SING_BOX' | null;
        coreVersions?: {
            singBox: string | null;
        };
        configApply?: {
            status: 'PENDING' | 'APPLIED' | 'UNCHANGED' | 'REJECTED' | 'ROLLED_BACK' | 'FAILED';
            requestedHash: string;
            activeHash: string | null;
            attemptedAt: string;
            appliedAt: string | null;
            rollback: 'NOT_REQUIRED' | 'SUCCEEDED' | 'FAILED' | 'NOT_AVAILABLE';
        };
    };
};

type CoreStopResponse = { response: { isStopped: boolean } };

type CollectReportsResponse = {
    response: {
        reports: Array<{
            actionReport: {
                blocked: boolean;
                ip: string;
                blockDuration: number;
                willUnblockAt: Date;
                userId: string;
                processedAt: Date;
            };
            coreReport: {
                email: string | null;
                level: number | null;
                protocol: string | null;
                network: string;
                source: string | null;
                destination: string;
                routeTarget: string | null;
                originalTarget: string | null;
                inboundTag: string | null;
                inboundName: string | null;
                inboundLocal: string | null;
                outboundTag: string | null;
                ts: number;
            };
        }>;
    };
};

export type NodeAgentHealthResponse = {
    isAlive: boolean;
    nodeVersion: string;
    runningCore: 'SING_BOX' | null;
    supportedCores: Array<'SING_BOX'>;
    coreVersions?: {
        singBox: string | null;
    };
    capabilities: string[];
    runtimeMode: TNodeRuntimeStatus['mode'];
    coreOnline: boolean;
    forwarding: TNodeRuntimeStatus['forwarding'];
    usageSnapshot: TNodeRuntimeStatus['usageSnapshot'];
};

export type NodeSystemStatsResponse = {
    coreInfo: {
        numGoroutine: number;
        numGC: number;
        alloc: number;
        totalAlloc: number;
        sys: number;
        mallocs: number;
        frees: number;
        liveObjects: number;
        pauseTotalNs: number;
        uptime: number;
    } | null;
    plugins: { torrentBlocker: { reportsCount: number } };
    system: { stats: TNodeSystem['stats'] };
};

export interface GetUsersInboundStatsResponse {
    response: {
        users: Array<{
            username: string;
            inbound: string;
            uplink: number;
            downlink: number;
        }>;
    };
}

const EMPTY_BODY: Readonly<Record<string, never>> = {};
const MAX_NODE_ERROR_LENGTH = 2_000;
const ZSTD_HEADERS: RawAxiosRequestHeaders = { 'Content-Encoding': 'zstd' };

const zstdCompressAsync = promisify(zstdCompress);

const ZSTD_OPTIONS: ZstdOptions = {
    params: {
        [zlibConstants.ZSTD_c_compressionLevel]: 1,
        [zlibConstants.ZSTD_c_enableLongDistanceMatching]: 1,
        [zlibConstants.ZSTD_c_windowLog]: 25,
    },
    chunkSize: 1024 * 1024,
};

export interface UsageSnapshotCounter {
    kind: 'user' | 'inbound' | 'outbound';
    name: string;
    inbound?: string;
    direction: 'uplink' | 'downlink';
    value: number;
}

export interface UsageSnapshot {
    generation: string;
    sequence: number;
    capturedAt: string;
    core: string;
    counters: UsageSnapshotCounter[];
}

export interface UsageSnapshotStatus {
    active: boolean;
    capturing?: boolean;
    generation: string;
    oldestSequence: number;
    latestSequence: number;
    ackedThrough: number;
    pending: number;
    bytes: number;
    lastCapturedAt?: string;
}

export type ForwardingAgentResult<T> =
    | { isOk: true; response: T }
    | {
          isOk: false;
          status?: number;
          code?: string;
          message: string;
          conflict?: {
              protocol: 'TCP' | 'UDP' | 'TCP_UDP';
              port: number;
              conflictsWith: string;
              detail?: string;
          };
      };

@Injectable()
export class AxiosService {
    private readonly logger = new Logger(AxiosService.name);

    public axiosInstance: AxiosInstance;
    private mtlsOptions: IMtlsOptions;
    private readonly socksAgentCache = new Map<string, MtlsSocksProxyAgent>();

    constructor(private readonly commandBus: CommandBus) {
        this.axiosInstance = axios.create({
            timeout: 45_000,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
    }

    public async setJwt() {
        try {
            const result = await this.commandBus.execute(new GetNodeJwtCommand());

            if (!result.isOk) {
                throw new Error(
                    'There are a problem with the JWT token. Please restart Remnawave.',
                );
            }

            const jwt = result.response;

            this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${jwt.jwtToken}`;

            this.mtlsOptions = {
                cert: jwt.clientCert,
                key: jwt.clientKey,
                ca: jwt.caCert,
            };

            const httpsAgent = new https.Agent({
                ...this.mtlsOptions,
                checkServerIdentity: () => undefined,
                rejectUnauthorized: true,
                keepAlive: true,
                minVersion: 'TLSv1.3',
            });

            this.axiosInstance.defaults.httpsAgent = httpsAgent;

            this.logger.log('Axios interceptor registered');
        } catch (error) {
            this.logger.error(`Error in onApplicationBootstrap: ${error}`);
            throw error;
        }
    }

    private resolveAgent(proxyUrl: null | string): https.Agent {
        if (!proxyUrl) {
            return this.axiosInstance.defaults.httpsAgent as https.Agent;
        }

        const cached = this.socksAgentCache.get(proxyUrl);
        if (cached) return cached;

        const httpsAgent = new MtlsSocksProxyAgent(proxyUrl, this.mtlsOptions);
        this.socksAgentCache.set(proxyUrl, httpsAgent);

        return httpsAgent;
    }

    private getNodeUrl(url: string, path: string, port: null | number): string {
        return port ? `https://${url}:${port}${path}` : `https://${url}${path}`;
    }

    private extractNodeError(error: AxiosError): string {
        const data = error.response?.data;
        let reason: string | undefined;

        if (typeof data === 'string') {
            reason = data;
        } else if (data && typeof data === 'object') {
            const body = data as { error?: unknown; message?: unknown };
            reason =
                typeof body.message === 'string'
                    ? body.message
                    : typeof body.error === 'string'
                      ? body.error
                      : JSON.stringify(data);
        }

        reason = reason?.trim();
        if (!reason) return error.message;

        return reason.length > MAX_NODE_ERROR_LENGTH
            ? `${reason.slice(0, MAX_NODE_ERROR_LENGTH)}…`
            : reason;
    }

    private resolveAgentAndUrl(
        path: string,
        opts: INodeConnectionOpts,
    ): { url: string; httpsAgent: https.Agent } {
        return {
            url: this.getNodeUrl(opts.address, path, opts.port),
            httpsAgent: this.resolveAgent(opts.proxyUrl),
        };
    }

    private async request<TResponse extends { response: unknown }>(
        params: INodeRequestOpts,
    ): Promise<TResult<TResponse['response']>> {
        const {
            label,
            opts,
            path,
            data,
            compress: useCompression = false,
            handle500 = false,
            internalError = false,
            logAxiosError = true,
            method = 'post',
            timeout,
        } = params;

        const url = this.getNodeUrl(opts.address, path, opts.port);
        const httpsAgent = this.resolveAgent(opts.proxyUrl);

        try {
            let body: unknown = EMPTY_BODY;
            let headers: RawAxiosRequestHeaders | undefined;

            if (method === 'post') {
                body = data ?? EMPTY_BODY;

                if (useCompression) {
                    const startTime = getTime();
                    const { buffer: compressedData, size } = await this.compressData(data);

                    this.logger.log(
                        `[ZSTD] [${label}] ${formatExecutionTime(startTime)} | ${prettyBytesUtil(size)} -> ${prettyBytesUtil(compressedData.length)}`,
                    );

                    body = compressedData;
                    headers = ZSTD_HEADERS;
                }
            }

            const config: AxiosRequestConfig = { headers, httpsAgent, timeout };

            const response: AxiosResponse<TResponse> =
                method === 'get'
                    ? await this.axiosInstance.get<TResponse>(url, config)
                    : await this.axiosInstance.post<TResponse>(url, body, config);

            return ok(response.data.response);
        } catch (error) {
            if (internalError) {
                return this.failWithInternalError(label, error);
            }

            if (error instanceof AxiosError) {
                if (logAxiosError) {
                    this.logger.error(`Error in Axios ${label} request: ${error.message}`);
                }

                if (handle500 && error.response?.status === 500) {
                    return fail(
                        ERRORS.NODE_ERROR_500_WITH_MSG.withMessage(this.extractNodeError(error)),
                    );
                }

                return fail(ERRORS.NODE_ERROR_WITH_MSG.withMessage(JSON.stringify(error.message)));
            }

            this.logger.error(`Error in ${label}: ${error}`);

            return fail(
                ERRORS.NODE_ERROR_WITH_MSG.withMessage(JSON.stringify(error) ?? 'Unknown error'),
            );
        }
    }

    public async startCore(
        data: CoreStartRequest,
        opts: INodeConnectionOpts,
    ): Promise<TResult<CoreStartResponse['response']>> {
        return this.request<CoreStartResponse>({
            label: 'START CORE',
            path: '/node/core/start',
            opts,
            data,
            compress: true,
            logAxiosError: false,
            timeout: 60_000,
        });
    }

    public async stopCore(
        opts: INodeConnectionOpts,
    ): Promise<TResult<CoreStopResponse['response']>> {
        return this.request<CoreStopResponse>({
            label: 'STOP CORE',
            path: '/node/core/stop',
            opts,
            method: 'get',
        });
    }

    public async getNodeHealth(
        opts: INodeConnectionOpts,
    ): Promise<TResult<NodeAgentHealthResponse>> {
        return this.request<{ response: NodeAgentHealthResponse }>({
            label: 'GET NODE HEALTH',
            path: '/node/core/healthcheck',
            opts,
            method: 'get',
            logAxiosError: false,
            timeout: 15_000,
        });
    }

    public async validateNodeForwarding(
        config: NodeForwardingConfig,
        opts: INodeConnectionOpts,
    ): Promise<ForwardingAgentResult<{ accepted: boolean }>> {
        return this.forwardingRequest('/node/forwarding/validate', opts, { config });
    }

    public async syncNodeForwarding(
        config: NodeForwardingConfig,
        opts: INodeConnectionOpts,
    ): Promise<ForwardingAgentResult<NodeForwardingRuntimeStatus>> {
        return this.forwardingRequest('/node/forwarding/sync', opts, { config });
    }

    public async getNodeForwardingStatus(
        opts: INodeConnectionOpts,
    ): Promise<ForwardingAgentResult<NodeForwardingRuntimeStatus>> {
        return this.forwardingRequest('/node/forwarding/status', opts, undefined, 'get');
    }

    private async forwardingRequest<T>(
        path: string,
        opts: INodeConnectionOpts,
        data?: unknown,
        method: 'get' | 'post' = 'post',
    ): Promise<ForwardingAgentResult<T>> {
        const { url, httpsAgent } = this.resolveAgentAndUrl(path, opts);
        try {
            const response =
                method === 'get'
                    ? await this.axiosInstance.get<{ response: T }>(url, {
                          httpsAgent,
                          timeout: 15_000,
                      })
                    : await this.axiosInstance.post<{ response: T }>(url, data ?? EMPTY_BODY, {
                          httpsAgent,
                          timeout: 15_000,
                      });
            return { isOk: true, response: response.data.response };
        } catch (error) {
            if (error instanceof AxiosError) {
                const body = error.response?.data as
                    | {
                          message?: string;
                          code?: string;
                          conflict?: {
                              protocol: 'TCP' | 'UDP' | 'TCP_UDP';
                              port: number;
                              conflictsWith: string;
                              detail?: string;
                          };
                      }
                    | undefined;
                return {
                    isOk: false,
                    status: error.response?.status,
                    code: body?.code,
                    message: body?.message ?? error.message,
                    conflict: body?.conflict,
                };
            }
            return { isOk: false, message: String(error) };
        }
    }

    /*
     * STATS MANAGEMENT
     */

    public async getUsersStats(
        data: GetUsersStatsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetUsersStatsCommand.Response['response']>> {
        return this.request<GetUsersStatsCommand.Response>({
            label: 'GET USERS STATS',
            path: GetUsersStatsCommand.url,
            opts,
            data,
            timeout: 15_000,
        });
    }

    public async getUsersInboundStats(
        data: GetUsersStatsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetUsersInboundStatsResponse['response']>> {
        return this.request<GetUsersInboundStatsResponse>({
            label: 'GET USERS INBOUND STATS',
            path: '/node/stats/get-users-inbound-stats',
            opts,
            data,
            timeout: 15_000,
        });
    }

    public async getIpsList(
        data: GetUserIpListCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetUserIpListCommand.Response['response']>> {
        return this.request<GetUserIpListCommand.Response>({
            label: 'GET IPS LIST',
            path: GetUserIpListCommand.url,
            opts,
            data,
            logAxiosError: false,
            timeout: 5_000,
        });
    }

    public async getUsersIpsList(
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetUsersIpListCommand.Response['response']>> {
        return this.request<GetUsersIpListCommand.Response>({
            label: 'GET USERS IPS LIST',
            path: GetUsersIpListCommand.url,
            opts,
            method: 'get',
            logAxiosError: false,
            timeout: 10_000,
        });
    }

    public async getSystemStats(
        opts: INodeConnectionOpts,
    ): Promise<TResult<NodeSystemStatsResponse>> {
        return this.request<{ response: NodeSystemStatsResponse }>({
            label: 'GET SYSTEM STATS',
            path: '/node/stats/get-system-stats',
            opts,
            method: 'get',
            handle500: true,
            logAxiosError: false,
            timeout: 15_000,
        });
    }

    public async getCombinedStats(
        data: GetCombinedStatsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetCombinedStatsCommand.Response['response']>> {
        return this.request<GetCombinedStatsCommand.Response>({
            label: 'GET COMBINED STATS',
            path: GetCombinedStatsCommand.url,
            opts,
            data,
            handle500: true,
            logAxiosError: false,
        });
    }

    public async getGeocheck(
        data: GetGeocheckCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetGeocheckCommand.Response['response']>> {
        return this.request<GetGeocheckCommand.Response>({
            label: 'GET GEO CHECK',
            path: GetGeocheckCommand.url,
            opts,
            data,
            handle500: true,
            logAxiosError: false,
            timeout: 55_000,
        });
    }

    public async getUsageSnapshotStatus(
        opts: INodeConnectionOpts,
    ): Promise<UsageSnapshotStatus | null> {
        const { url, httpsAgent } = this.resolveAgentAndUrl(
            '/node/stats/usage-snapshots/status',
            opts,
        );
        return this.retryUsageSnapshotRequest('status', async () => {
            try {
                const { data } = await this.axiosInstance.get<{
                    response: UsageSnapshotStatus;
                }>(url, {
                    timeout: 15_000,
                    httpsAgent,
                });
                return data.response;
            } catch (error) {
                if (error instanceof AxiosError && error.response?.status === 404) return null;
                throw error;
            }
        });
    }

    public async activateUsageSnapshots(opts: INodeConnectionOpts): Promise<UsageSnapshotStatus> {
        const { url, httpsAgent } = this.resolveAgentAndUrl(
            '/node/stats/usage-snapshots/activate',
            opts,
        );
        return this.retryUsageSnapshotRequest('activate', async () => {
            const { data } = await this.axiosInstance.post<{ response: UsageSnapshotStatus }>(
                url,
                {},
                { timeout: 15_000, httpsAgent },
            );
            return data.response;
        });
    }

    public async pullUsageSnapshots(
        request: { afterSequence: number; limit?: number; maxBytes?: number },
        opts: INodeConnectionOpts,
    ): Promise<{ generation: string; snapshots: UsageSnapshot[]; hasMore: boolean }> {
        const { url, httpsAgent } = this.resolveAgentAndUrl(
            '/node/stats/usage-snapshots/pull',
            opts,
        );
        return this.retryUsageSnapshotRequest('pull', async () => {
            const { data } = await this.axiosInstance.post<{
                response: { generation: string; snapshots: UsageSnapshot[]; hasMore: boolean };
            }>(url, request, { timeout: 30_000, httpsAgent });
            return data.response;
        });
    }

    public async ackUsageSnapshots(
        request: { generation: string; throughSequence: number },
        opts: INodeConnectionOpts,
    ): Promise<UsageSnapshotStatus> {
        const { url, httpsAgent } = this.resolveAgentAndUrl(
            '/node/stats/usage-snapshots/ack',
            opts,
        );
        return this.retryUsageSnapshotRequest('ack', async () => {
            const { data } = await this.axiosInstance.post<{ response: UsageSnapshotStatus }>(
                url,
                request,
                { timeout: 15_000, httpsAgent },
            );
            return data.response;
        });
    }

    private retryUsageSnapshotRequest<T>(label: string, operation: () => Promise<T>): Promise<T> {
        return retryTransient(operation, {
            onRetry: (error) => {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Usage snapshot ${label} request failed, retrying: ${message}`);
            },
        });
    }

    /*
     * User management
     */

    public async addUser(
        data: AddUserCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<AddUserCommand.Response['response']>> {
        return this.request<AddUserCommand.Response>({
            label: 'ADD USER',
            path: AddUserCommand.url,
            opts,
            data,
            timeout: 20_000,
        });
    }

    public async deleteUser(
        data: RemoveUserCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<RemoveUserCommand.Response['response']>> {
        return this.request<RemoveUserCommand.Response>({
            label: 'DELETE USER',
            path: RemoveUserCommand.url,
            opts,
            data,
            internalError: true,
            timeout: 20_000,
        });
    }

    public async addUsers(
        data: AddUsersCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<AddUsersCommand.Response['response']>> {
        return this.request<AddUsersCommand.Response>({
            label: 'ADD USERS',
            path: AddUsersCommand.url,
            opts,
            data,
            compress: true,
            timeout: 20_000,
        });
    }

    public async deleteUsers(
        data: RemoveUsersCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<RemoveUsersCommand.Response['response']>> {
        return this.request<RemoveUsersCommand.Response>({
            label: 'DELETE USERS',
            path: RemoveUsersCommand.url,
            opts,
            data,
            compress: true,
            internalError: true,
            timeout: 20_000,
        });
    }

    public async dropUsersConnections(
        data: DropUsersConnectionsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<DropUsersConnectionsCommand.Response['response']>> {
        return this.request<DropUsersConnectionsCommand.Response>({
            label: 'DROP USERS CONNECTIONS',
            path: DropUsersConnectionsCommand.url,
            opts,
            data,
            timeout: 10_000,
        });
    }

    public async dropIpsConnections(
        data: DropIpsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<DropIpsCommand.Response['response']>> {
        return this.request<DropIpsCommand.Response>({
            label: 'DROP IPS CONNECTIONS',
            path: DropIpsCommand.url,
            opts,
            data,
            timeout: 10_000,
        });
    }

    public async syncNodePlugins(
        data: SyncCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<SyncCommand.Response['response']>> {
        return this.request<SyncCommand.Response>({
            label: 'SYNC-NODE-PLUGINS',
            path: SyncCommand.url,
            opts,
            data,
            compress: true,
            logAxiosError: false,
            timeout: 10_000,
        });
    }

    public async collectTorrentBlockerReports(
        opts: INodeConnectionOpts,
    ): Promise<TResult<CollectReportsResponse['response']>> {
        return this.request<CollectReportsResponse>({
            label: 'COLLECT TORRENT BLOCKER REPORTS',
            path: '/node/plugin/torrent-blocker/collect',
            opts,
            logAxiosError: false,
            timeout: 20_000,
        });
    }

    public async blockIps(
        data: BlockIpsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<BlockIpsCommand.Response['response']>> {
        return this.request<BlockIpsCommand.Response>({
            label: 'BLOCK IPS',
            path: BlockIpsCommand.url,
            opts,
            data,
            timeout: 10_000,
        });
    }

    public async unblockIps(
        data: UnblockIpsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<UnblockIpsCommand.Response['response']>> {
        return this.request<UnblockIpsCommand.Response>({
            label: 'UNBLOCK IPS',
            path: UnblockIpsCommand.url,
            opts,
            data,
            timeout: 10_000,
        });
    }

    public async recreateTables(
        opts: INodeConnectionOpts,
    ): Promise<TResult<RecreateTablesCommand.Response['response']>> {
        return this.request<RecreateTablesCommand.Response>({
            label: 'RECREATE TABLES',
            path: RecreateTablesCommand.url,
            opts,
            timeout: 10_000,
        });
    }

    private failWithInternalError<T>(label: string, error: unknown): TResult<T> {
        if (error instanceof AxiosError) {
            this.logger.error(`Error in ${label}: ${error.response?.data}`);
        } else {
            this.logger.error(`Error in ${label}: ${error}`);
        }

        return fail(ERRORS.INTERNAL_SERVER_ERROR);
    }

    private async compressData(data: unknown): Promise<{
        buffer: Buffer;
        size: number;
    }> {
        const buffer = Buffer.from(JSON.stringify(data));

        return {
            buffer: await zstdCompressAsync(buffer, {
                ...ZSTD_OPTIONS,
                pledgedSrcSize: buffer.length,
            }),
            size: buffer.length,
        };
    }
}
