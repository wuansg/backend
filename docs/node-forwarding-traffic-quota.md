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

## Production rollout — 2026-10-08

- Backend source: `da332718896a362ece5765f5bfc9c9b0190c8293`.
- GitHub node quota regression: `37724736542`; directional usage regression:
  `37724738978`; daily traffic regression: `37724741784`; image build:
  `37724736583`. All completed successfully, amd64 only.
- Deployed immutable image:
  `ghcr.io/wuansg/backend:3.17.5-anytls@sha256:18fc6f214a7840c0668c16a481b44d85e6f5754dd7e90b8c5781175c154e11c8`.
- Backup: `/opt/remnawave/backups/release-3.17.5-20261008/`; database dump SHA256:
  `8e3134f1afc3228e952689b4fdc8b54bb67bba898ef986bc5e6dce988a2980a4`.
- Previous 3.17.4 image and Compose remain available for rollback. Migration is
  additive; rolling back the executable does not erase counters or history.
- At 03:56 UTC (11:56 Beijing), all 13 node totals exactly matched their pre-
  upgrade quota plus subsequent core bytes plus current-period forwarding
  bytes. All boundaries were initialized, and the actual node-list API returned
  the updated totals. AliHK: 10.49 GiB; YH AliHK: 4.71 GiB; Aiyun: 113.07 GiB;
  CloudSilk: 207.49 GiB. These are verification-time values, not fixed totals.
- All 13 Agents remain on 3.15.0, connected, with unchanged core/forwarding
  config hashes and no pending/error snapshots. The four forwarding-only nodes
  correctly retain no running core. No benchmarks were started. Both previously
  sent daily reports, their message hashes and send states remained unchanged.
- A second ingestion check confirmed that all 13 boundaries stayed unchanged
  and every quota still exactly matched current-period core plus forwarding
  increments, without a second backfill.
