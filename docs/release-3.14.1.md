# 3.14.1 subscription compatibility update — 2026-10-04

- Backend source: `90c0f057`. GitHub Actions run `37174277274` passed.
- Deployed on nlfra using the GitHub-built linux/amd64 image:
  `ghcr.io/wuansg/backend:3.14.1-anytls@sha256:55b546596a9d39a925332948e1c9b97de968cb9a29f72ee1de64c5ccf6ce19dd`.
- Frontend, contract and Agent versions are unchanged. No schema migration.
- Surge now follows the Snell inbound version (5), with policy `block-quic=on`
  because the sing-box server does not implement Surge's QUIC Proxy Mode.
  Ordinary UDP relay remains enabled; do not globally override with
  `block-quic=always-allow`.
- Stash no longer filters Snell hosts: version 5, PSK, UDP and optional HTTP
  obfuscation are generated. Requires Stash iOS/tvOS 3.6+ or macOS 4.3+.
- Mihomo remains version 5; sing-box outbound remains version 4 as required by
  its parser, interoperating with the v5 server.
- Snell/Surge/Stash regression tests, TypeScript, production build, subscription
  remarks, sing-box generator, Host Mapper and Xray cleanup tests passed.
- Production subscription requests verified both Hong Kong ali and Taiwan ali:
  Surge v5 with QUIC blocked, Stash v5, Mihomo v5 and sing-box outbound v4.
  No credentials or subscription URLs were printed during validation.
- Native Surge/Stash clients are not available on this Linux host; verification
  is of generated/live subscription output, not native Apple-client traffic.
- Panel health is healthy with zero container restarts. Previous Compose is at
  `/opt/remnawave/backups/release-3.14.1-20261004/docker-compose.pre.yml` on nlfra.

References: [Surge Snell](https://manual.nssurge.com/policies/snell.html),
[Surge policy parameters](https://manual.nssurge.com/policies/parameters.html),
[Stash Snell](https://stash.wiki/proxy-protocols/proxy-types#snell).
