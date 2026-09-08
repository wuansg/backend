import { makeCounterProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus';

import { METRIC_NAMES } from '@libs/contracts/constants';

export const METRIC_PROVIDERS = [
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_ONLINE_USERS,
        help: 'Number of online users on a node',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_STATUS,
        help: 'Node connection status (1 - connected, 0 - disconnected)',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.USERS_STATUS,
        help: 'Counter for users statuses, updated every 1 minute',
        labelNames: ['status'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.USERS_ONLINE_STATS,
        help: 'Counter for online stats of distinct users, updated every 1 minute',
        labelNames: ['metricType'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.USERS_TOTAL,
        help: 'Total number of users, updated every 1 minute',
        labelNames: ['type'],
    }),
    makeCounterProvider({
        name: METRIC_NAMES.NODE_INBOUND_UPLOAD_BYTES,
        help: 'Inbound upload bytes, updated every 30 seconds',
        labelNames: ['node_uuid', 'tag'],
    }),
    makeCounterProvider({
        name: METRIC_NAMES.NODE_INBOUND_DOWNLOAD_BYTES,
        help: 'Inbound download bytes, updated every 30 seconds',
        labelNames: ['node_uuid', 'tag'],
    }),
    makeCounterProvider({
        name: METRIC_NAMES.NODE_OUTBOUND_UPLOAD_BYTES,
        help: 'Outbound upload bytes, updated every 30 seconds',
        labelNames: ['node_uuid', 'tag'],
    }),
    makeCounterProvider({
        name: METRIC_NAMES.NODE_OUTBOUND_DOWNLOAD_BYTES,
        help: 'Outbound download bytes, updated every 30 seconds',
        labelNames: ['node_uuid', 'tag'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_RSS_BYTES,
        help: 'Process resident set size in bytes.',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_HEAP_USED_BYTES,
        help: 'Process heap used in bytes.',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_HEAP_TOTAL_BYTES,
        help: 'Process total heap size in bytes.',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_EXTERNAL_BYTES,
        help: 'Process external memory in bytes (C++ objects bound to JS).',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_ARRAY_BUFFERS_BYTES,
        help: 'Process ArrayBuffers memory in bytes.',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_EVENT_LOOP_DELAY_MS,
        help: 'Mean event loop delay in milliseconds.',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_EVENT_LOOP_P99_MS,
        help: 'Event loop delay p99 in milliseconds.',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_ACTIVE_HANDLES,
        help: 'Number of active resource handles.',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.PROCESS_UPTIME_SECONDS,
        help: 'Process uptime in seconds.',
        labelNames: ['instance_id', 'instance_name'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_NETWORK_RX_BYTES_PER_SEC,
        help: 'Node network receive speed in bytes per second',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_NETWORK_TX_BYTES_PER_SEC,
        help: 'Node network transmit speed in bytes per second',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_NETWORK_RX_BYTES_TOTAL,
        help: 'Node network total received bytes since boot from default interface',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_NETWORK_TX_BYTES_TOTAL,
        help: 'Node network total transmitted bytes since boot from default interface',
        labelNames: ['node_uuid'],
    }),

    makeGaugeProvider({
        name: METRIC_NAMES.NODE_MEMORY_TOTAL_BYTES,
        help: 'Node total memory in bytes',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_MEMORY_FREE_BYTES,
        help: 'Node free memory in bytes',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_UPTIME_SECONDS,
        help: 'Node OS uptime in seconds',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_CPU_COUNT,
        help: 'Node CPU count',
        labelNames: ['node_uuid'],
    }),

    makeGaugeProvider({
        name: METRIC_NAMES.NODE_CPU_COUNT,
        help: 'Node CPU count',
        labelNames: ['node_uuid'],
    }),

    makeGaugeProvider({
        name: METRIC_NAMES.NODE_CPU_LOAD_AVG_1M,
        help: 'Node CPU load average 1 minute',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_CPU_LOAD_AVG_5M,
        help: 'Node CPU load average 5 minutes',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_CPU_LOAD_AVG_15M,
        help: 'Node CPU load average 15 minutes',
        labelNames: ['node_uuid'],
    }),

    makeGaugeProvider({
        name: METRIC_NAMES.NODE_SYSTEM_INFO,
        help: 'Node system info',
        labelNames: [
            'node_uuid',
            'arch',
            'cpu_model',
            'hostname',
            'platform',
            'release',
            'version',
        ],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_BASIC_INFO,
        help: 'Node basic info',
        labelNames: ['node_uuid', 'node_name', 'node_country_emoji', 'provider_name', 'tags'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_PENDING,
        help: 'Number of snapshots still queued on the node',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_QUEUE_BYTES,
        help: 'Durable usage snapshot queue size on the node in bytes',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_LAG_SECONDS,
        help: 'Seconds since the newest captured usage snapshot',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_SEQUENCE_GAP,
        help: 'Received but not yet applied snapshot sequence count',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_ERROR,
        help: 'Whether the most recent snapshot ingestion attempt failed',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_CAPTURING,
        help: 'Whether the node is currently capturing usage snapshots from a running core',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_INGEST_SUCCESSES,
        help: 'Total successful usage snapshot ingestion attempts persisted in the database',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_INGEST_FAILURES,
        help: 'Total failed usage snapshot ingestion attempts persisted in the database',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_DATABASE_RETRIES,
        help: 'Total retried usage snapshot database transactions',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_LAST_SUCCESS_TIMESTAMP_SECONDS,
        help: 'Unix timestamp of the most recent successful usage snapshot ingestion',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.NODE_USAGE_SNAPSHOT_LAST_DURATION_SECONDS,
        help: 'Duration of the most recent successful usage snapshot ingestion in seconds',
        labelNames: ['node_uuid'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.TELEGRAM_TARGET_CONFIGURED,
        help: 'Whether a Telegram notification category has a configured target',
        labelNames: ['target'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.TELEGRAM_TARGET_AVAILABLE,
        help: 'Whether the configured Telegram notification target passed its last check',
        labelNames: ['target'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.TELEGRAM_TARGET_CIRCUIT_OPEN,
        help: 'Whether delivery to a Telegram notification target is circuit-broken',
        labelNames: ['target'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.TELEGRAM_TARGET_SEND_SUCCESSES,
        help: 'Successful Telegram notification deliveries',
        labelNames: ['target'],
    }),
    makeGaugeProvider({
        name: METRIC_NAMES.TELEGRAM_TARGET_SEND_FAILURES,
        help: 'Failed Telegram notification deliveries',
        labelNames: ['target'],
    }),
];

export interface INodeBaseMetricLabels {
    node_uuid: string;
    node_name: string;
    node_country_emoji: string;
    provider_name: string;
    tags: string;
}

export interface INodeBandwidthMetricLabels {
    node_uuid: string;
    tag: string;
}

export interface INodeMetricLabel {
    node_uuid: string;
}

export interface INodeSystemMetricLabels extends INodeMetricLabel {
    arch: string;
    cpu_model: string;
    hostname: string;
    platform: string;
    release: string;
    version: string;
}
