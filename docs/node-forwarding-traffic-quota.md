# Node quota includes forwarding (3.17.5)

The existing `trafficUsedBytes` field used by node cards, tables, details and
quota notifications now counts **core outbound upload + download and valid nft
forwarding TCP/UDP upload + download**, with the node consumption multiplier.
It does not charge users or Hosts for forwarding traffic. No Agent or Frontend
update is necessary.

Core hourly history and forwarding hourly history remain independent. Their
daily report sections and range APIs are unchanged. Counting traffic on both
an intermediate node and its destination is intentional: each node has its own
provider quota. This is not a combined cross-node physical-network total.

## Persistence and resets

Quota, forwarding history, inbox applied markers and the one-time backfill
commit in the same transaction. The node row is locked to serialize updates
with resets; concurrent workers, retries and restarts cannot add usage twice.
`trafficUsageStartedAt` is internal, and manual/scheduled resets write it
atomically with zeroing the counter. Delayed snapshots captured before that
boundary still update history but not the new quota. Existing reset time is
preserved: 01:00 in the panel process timezone, clamped to the month's final
day for reset days 29–31.

## Legacy backfill

The additive migration leaves existing nodes' boundary NULL; newly created
nodes default to the creation time. On first ingestion, existing nodes retain
their core quota and add only forwarding history from their configured current
cycle, or from creation for nodes without monthly tracking. The backfill marker
is persisted transactionally. No duplicate addition occurs on later restarts.

Legacy versions did not record manual reset times. The first backfill therefore
uses the configured monthly reset day, not an unknowable earlier manual reset.
Hourly legacy history includes the first partial creation hour. Historical
forwarding uses the current node multiplier: past multiplier changes and
per-snapshot fractional rounding cannot be reconstructed from hourly raw data.
New snapshots use the configured multiplier, rounded once per snapshot.

## Verification

`npm run test:node-traffic` covers timezone/month boundaries, upload/download,
TCP/UDP filtering, mixed and forwarding-only nodes, multipliers, independent
user/Host/core histories, and both reset entry points. Setting
`NODE_TRAFFIC_TEST_DATABASE_URL` enables real PostgreSQL migration/ingestion
tests, including concurrency, replay/restart, historical backfill, late
snapshots, transaction rollback and retry. The URL must point to an empty local
`remnawave_node_traffic_test` database owned by `node_traffic_test`, with
`connection_limit=2`. Production databases are explicitly refused.
