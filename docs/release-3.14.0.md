# 3.14.0 deployment — 2026-10-03

## Published artifacts

- Backend source: `d0f50f361500f6decc78990bdf91f48d5003e56a`.
- Frontend source: `45ddc4e7249061b6c061db7372ee35d30dea0d1b`.
- Agent source: `04cf8ab`.
- Contract: `3.14.0-anytls.0`; Actions run `37129822136` passed. Frontend lockfile
  uses the checksum of the GitHub-built asset, not the local development tarball.
- Backend Actions run `37130093316` passed. Image:
  `ghcr.io/wuansg/backend:3.14.0-anytls@sha256:1adf26807a5c3026f3407d8a337fdc3ad7294422b0a9e5b751a03bff97f0602a`.
- Agent Actions run `37129827163` passed, including unit/race tests and patched
  core integration/accounting tests. Image:
  `ghcr.io/wuansg/remnawave-node-go:3.14.0@sha256:8f247b8d354e07ae5d1e40ef122c3cf3d2ae03346931c77a6f59735ece12b073`.
- Both workflows built linux/amd64 only. No binaries were copied to production.

## Deployment and verification

- nlfra panel updated before Agents. Health endpoint and public HTTP checks pass;
  running image metadata identifies the intended backend and frontend commits.
- aiyun updated first. An independent profile listening on loopback port 55435
  exercised normal panel configuration delivery and Agent core startup without
  replacing its existing 54320 forwarding rule.
- Isolated Mihomo clients configured as version 5 and sing-box clients configured
  as version 4 each downloaded 1,000,000 bytes and uploaded 262,144 bytes over
  the v5 canary. Recorded user usage included 527,504 upload and 2,023,841 download
  bytes (including protocol overhead). Snapshot ingestion was current.
- aiyun was restored to its original forwarding-only assignment afterwards.
  The temporary canary profile was removed; usage records were retained.
- DWHK updated after canary acceptance. Its 54320 inbound is now `Snell_DWHK`,
  version 5 with 16 independent user PSKs. Existing 54321 Shadowsocks, 443 Trojan
  and both forwarding rules remain. Original AnyTLS squad access was inherited.
- The existing ali Host pointing to DWHK was reassigned to the Snell inbound;
  other nodes retain their existing AnyTLS assignments.
- Both client implementations passed real upload/download tests through DWHK
  directly and through the ali forwarding entry point.
- Only aiyun and DWHK Agents were upgraded in this rollout. The remaining eight
  Agents remain at 3.13.0 and are compatible with the new panel.

## Router operation note

The user's historical procedure refers to Nikki, but this router's active proxy
is now OpenClash (`/etc/openclash/silverspoon.yaml`). Port 9090 belongs to OpenClash.
Inspect the listener owner before future maintenance; a stale Nikki config is
not evidence that Nikki is running.

Final was moved from the original Hong Kong ali node to a tested independent
Singapore cft node before DWHK recreation. An attempted Nikki reload started an
extra instance with port conflicts; that instance was stopped. The actual
OpenClash subscription was updated through its native updater. Runtime now
reports Snell and the subscription uses version 5. After a successful delay test
(221 ms), Final was restored to the original Hong Kong ali node.

## Recovery

- Panel database dump, original Compose and configuration/association snapshot:
  `/opt/remnawave/backups/release-3.14.0-20261003/` on nlfra.
- Original Agent Compose on each upgraded node:
  `/root/remnanode-backups/release-3.14.0-20261003/docker-compose.pre.yml`.
- Router configuration backups remain in the local deployment working directory;
  they contain credentials and must not be committed or shared.
- Before an Agent rollback, remove/restore its Snell assignment: 3.13.0 does not
  support the managed multi-PSK inbound. Restore the matching Host subscription
  mapping as well. Database history was not dropped by this release.
