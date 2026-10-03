# Managed Snell v5 (3.14.0)

This is a Remnawave extension to the bundled sing-box 1.14.0 core, not an upstream
configuration option. It uses standard independent client PSKs on one TCP port;
clients do not need sing-box's `userkey` extension. No database migration is needed.

```json
{
  "type": "snell",
  "tag": "Snell",
  "listen": "0.0.0.0",
  "listen_port": 54320,
  "version": 5,
  "multi_user_psk": true,
  "users": []
}
```

- The panel replaces `users` with `{name: userId, psk: derivedCredential}` records.
  The PSK is HMAC-SHA256 of a fixed Snell-specific label keyed by the existing
  AnyTLS credential, base64url encoded. Revoking user credentials rotates it;
  disabling/deleting a user removes it. Existing AnyTLS credentials are unchanged.
- The Agent supports both full configuration and single/bulk user updates.
  Encoded user/inbound names continue through the normal connection and usage
  pipeline, with independent upload/download counters.
- Up to 256 users per Snell inbound. Empty users rejects all connections; no shared
  PSK fallback exists in this mode. Shared `psk`, `userkey`, TLS, V2Ray transports
  and multiplex are not supported in managed mode. `obfs_mode` may be `none` or
  `http`. Do not set user PSKs manually in panel profiles.
- The selector authenticates the first AEAD header, then delegates all framing,
  payload authentication, UDP transport, reuse and replay checks to the upstream
  per-user Snell service. Unauthenticated selection has 8 slots per inbound and
  a 10-second read deadline. Each connection checks up to N PSKs: this is intended
  for small private deployments, not a large public subscription service.
- Service version is 5. Mihomo subscriptions use **client version 5**; Mihomo
  accepts this setting and internally uses the v4-compatible wire protocol.
  sing-box subscriptions must use **client version 4**: its outbound rejects 5,
  while its v5 inbound interoperates with v4 clients. Surge subscriptions retain
  version 4 to avoid invoking Snell v5 QUIC Proxy Mode (unsupported upstream).
  Normal UDP over TCP works; the core does not implement v5 QUIC conversion.
- Generic Base64 links omit Snell because there is no portable Snell share-URI
  format. Stash output also omits it. Existing other protocols remain available.

## Validation and release

`npm run test:snell` covers credentials, configuration and generated subscriptions.
The Agent image applies `0002-snell-multi-psk.patch` and runs its protocol tests.
The GitHub workflow additionally runs race tests and `TestSnellIntegration` against
a real patched binary, including upload/download attribution and user revocation.
The latter can be run locally with `SING_BOX_TEST_BINARY=/absolute/path/sing-box`.
Set `MIHOMO_TEST_BINARY=/absolute/path/mihomo` to additionally exercise a separate
Mihomo process, without touching Nikki's configuration or running process.

Local validation (2026-10-02): backend/frontend type checks and production builds,
Agent unit tests/vet, patched core TCP/UDP/HTTP-obfs/auth/replay tests, and real-core
upload/download/revocation tests passed. Mihomo 1.19.31 passed 10 repeated runs,
each requiring five additional successful requests after startup readiness.
On 2026-10-03, Mihomo subscription output and the real-client integration fixture
were changed to version 5; subscription tests and 10 repeated integration runs
passed. The current sing-box binary rejects outbound version 5 during config
validation, so its subscription output remains version 4.
Surge configuration output is tested; a live Surge client is not available here.
Race checks are wired into GitHub Actions and have not run locally (CGO toolchain
limitations on this OpenWrt development host). No images have been published.

Release update (2026-10-03): GitHub Actions contract run `37129822136`, backend
image run `37130093316`, and Agent run `37129827163` passed, including CI race
tests. Backend/Frontend 3.14.0 is deployed on nlfra; Agent 3.14.0 is deployed on
aiyun and DWHK. See `release-3.14.0.md` for deployment and client verification.

The preceding Xray retirement work is also pending in 3.14.0: release the updated
contract/frontend/backend before the new Agent, per `xray-retirement-3.14.0.md`.
Do not apply this inbound to old Agents/unpatched cores. Publish immutable version
tags through GitHub Actions; do not copy this test binary to production.

DWHK remains unchanged during development. Before switching its 54320 inbound,
back up its profile/Host assignments, move Nikki Final off the dependent HK path,
upgrade and test on aiyun first, then switch DWHK and restore the original Final
choice after validating subscriptions, user traffic and forwarding conflicts.

References: [sing-box inbound](https://sing-box.sagernet.org/configuration/inbound/snell/),
[sing-box outbound](https://sing-box.sagernet.org/configuration/outbound/snell/),
[Mihomo](https://wiki.metacubex.one/config/proxies/snell/),
[Surge](https://manual.nssurge.com/policies/snell.html).
