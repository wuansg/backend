# Xray retirement — 3.14.0

## Implemented

- Remove Xray JSON renderer, default template/seed, template menu/editor, host template overrides, preview option and the Xray-only Host Mapper branch.
- Remove legacy Xray inbound conversion and the `xray-typed` dependency. Rename shared link generation to `Base64GeneratorService`; use core-neutral names for template injector and Shadowsocks helpers.
- Remove obsolete `/vision/block-ip` and `/vision/unblock-ip` agent endpoints, which previously only returned “unsupported”.
- Keep sing-box, Mihomo, Base64 and other supported client outputs, shared Mux/final-mask options and manual nftables block/drop APIs.
- Backend, frontend, agent and agent image version/tag defaults: **3.14.0**. API contract: **3.14.0-anytls.0**.

## Compatibility and exclusions

- `XRAY_BASE64` remains the historical API wire value for generic share links, not an Xray server core.
- Historical database columns, template rows and relations are not dropped. Xray JSON templates are excluded from public selection/retrieval and external-squad template responses.
- Stored response rules are adapted on read from `XRAY_JSON` to `XRAY_BASE64`, including cache hits. Legacy JSON-only flags are ignored/hidden; new JSON rules and previews are rejected. `/json` and `/v2ray-json` no longer provide subscriptions.
- Sing-box/Mihomo/Base64 Host Mapper branches remain. Host responses strip only the obsolete Xray mapper branch and obsolete subscription exclusion values.
- VLESS `xtls-rprx-vision` flow is a protocol feature, not the deleted Vision management endpoint, and remains supported.
- After explicit user confirmation, Torrent Blocker/Connection Drop configuration, automatic blocking/reporting, report APIs/pages, notification events and agent webhook/collection endpoints are removed. Legacy plugin fields are filtered on read and before sync; old notification files ignore the retired event without accepting arbitrary unknown events. Historical database rows and plugin configurations remain recoverable, and no production configuration was modified locally.
- Administrator IP blocks, unblocks and connection drops remain core-independent. Their timed nftables sets are now named `temporary-blocked-ip` / `temporary-blocked-ip6`. The node's table rebuild removes obsolete sets; ingress/egress filters, forwarding and traffic statistics are preserved.

## Validation

- Backend production/seed builds, TypeScript and lint pass.
- Frontend TypeScript and production build pass against the local 3.14.0 contract.
- Base64, Host Mapper, sing-box generator/default template/config, subscription remark and new `test:xray-cleanup` regressions pass.
- `test:retired-node-plugins` covers legacy field stripping, shared-list references, retained filters and old notification events. Agent regressions cover removed endpoints, manual IPv4/IPv6 blocking and ensuring retired plugin changes never restart sing-box.
- Agent tests and vet pass with `CGO_ENABLED=0`, matching the static image build. Local CGO/race tests cannot link missing libc development libraries; CI retains `go test -race ./...` on Ubuntu.
- Pre-existing `test:opaque-json` fails because the allowlist lacks Prisma JSON fields: `changes`, `configHashes`, `geocheckSource`, `interfaces`, `resolutionState`, `runtimeStatus`, `snapshot`. Its pre-existing working-tree change was preserved.
- Full frontend lint crashes inside oxlint's allocator, including a single-threaded non-sandbox retry. TypeScript/build succeed.

## Release order — not yet executed

1. Review existing unrelated working-tree changes before committing. The contract has a pre-existing `node-forwarding.schema.ts` change, so verify the final release tarball against the frontend lockfile integrity.
2. Publish the backend contract release with the existing GitHub workflow first. Check its SHA-512 and update the frontend lockfile if needed; never deploy a frontend pointing at an unpublished contract asset.
3. Publish frontend, then build the backend image with that frontend revision via GitHub Actions. No source-copy deployment.
4. Only after updating the backend, deploy the GitHub-built, version-tagged 3.14.0 agent image; canary aiyun before other nodes. Old backends still expect the removed Torrent report field in agent health responses. Follow the established Nikki Final-group switch procedure before upgrading DWHK.

No commits, pushes, releases or production deployments were performed during this local implementation.
