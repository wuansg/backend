# 指定用户访问审计

状态：GitHub 发布、面板上线、aiyun 兼容性灰度及 HostDZire SG 实际采集验收完成。
日期：2026-10-10 UTC。经用户明确指定，仅用户 ID `19` 开启，保存 7 天。

发布版本：Backend `3.18.0-anytls`、Contract `3.18.0-anytls.0`、
Frontend `3.17.0`、Agent `3.16.0`（sing-box 仍为 `1.14.0`）。
Frontend 使用独立类型校验的审计接口适配器，不需要等待新 Contract 资产发布。

## 入口与默认行为

- 用户详情的“访问审计”按钮：按用户 ID 单独开启/关闭，开启前需确认。
- 用户列表工具栏的“访问审计”按钮：全局查询已保存记录，可指定用户 ID；没有全部开启功能。
- 新增及既有用户默认关闭。查看窗口、保存天数或部署升级都不会自动开启。
- 关闭后 Backend 立即拒绝该用户的新记录；已保存历史保留至到期。
- 再次开启生成新的审计窗口，旧窗口的延迟队列不能继续写入。
- 历史默认保存 7 天，用户级可选 1–30 天；到期记录立即不可查询，后台每分钟清理。
- 日期默认 UTC 当天，最多查询 30 个完整日；共享左侧快捷栏。

## 能看到什么

记录用户、节点、连接时间、目标域名或 IP/端口、协议/入站、参考上传/下载字节、
连接关闭状态与不完整标记。支持域名包含、用户、节点、日期筛选、游标分页及目标 Top 20。
相同域名的不同目标 IP 合并排行；没有域名时按 IP 展示。

这些是代理连接目标，不是完整浏览历史。域名来自已有目标/嗅探元数据；
不会强制改变路由或全局嗅探，也不执行 HTTPS 解密。
HTTPS 页面路径、正文、搜索内容不可见；IP 直连、ECH、加密 DNS 等可能无法识别域名。
纯转发节点无法可靠关联用户/网站，不能提供此类审计。

流量是所列连接截至最后观察时的累计参考字节，不是筛选日期内逐日精确流量。
开启前已经活跃的连接扣除首次观察基线并标记不完整；缺失最终计量、重启/断流、
缓冲过期/溢出等仍可能造成缺口。不修改用户配额、节点/Host 用量或 Telegram 日报。

## 采集、隔离与限制

- 使用 sing-box 1.14 原生 `SubscribeConnections` 流，覆盖短连接与最终关闭计量；
  不靠周期扫描活跃连接列表推断网站。
- 原生流在内存中可能包含其他用户元数据；Agent 立即过滤，只将明确开启的用户写入审计队列。
  没有开启用户时不订阅。不能把这一点表述为核心从不接收其他连接元数据。
- 新的核心 API 仅监听 `127.0.0.1:61003`，带秘密认证；Agent API 复用既有 JWT/mTLS/SNI。
  不开放公网审计端口、不复制线上脚本、不引入流量解密。
- 面板每 10 秒协调、并发最多 3 个节点，授权租约 2 分钟。
  面板失联后租约到期停止采集；Agent 重启必须重新授权。
- 独立 bbolt 文件 `/var/lib/remnanode/access-audit.db`：本地投递/重放缓冲最长约 24 小时，
  每小时清理，不随长连接流停止清理；最长可能多保留一个清理周期。
  最多 5 万记录、32 MiB 逻辑记录内容预算，不是数据库物理文件的严格 32 MiB 上限。
- 每批默认 200、最多 500 条，最多约 1 MiB；写入成功才 ACK。
  ACK generation/sequence 与绝对计量去重，重试不叠加；关闭快照重放不把访问时间挪到今天。
- 数据库写入与政策修改共用锁；超限、断流和同步失败显示状态提示，不阻止原代理服务启动。
- 只对管理员或明确授予 `access-audit` 权限的 API token 开放。
  `users:read` / `connections:read` 不包含审计读取权限。
  开关、查询、排行记录操作者日志，不在操作日志中输出域名/目标/秘密。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/access-audit/users/:userId/policy` | 用户开关及节点采集状态 |
| PUT | `/api/access-audit/users/:userId/policy` | `{enabled, retentionDays}`，只作用于此用户 |
| GET | `/api/access-audit/records` | 连接记录分页 |
| GET | `/api/access-audit/domains` | 目标用量排行 |

读取分别支持 `policy-read` / `records-read` / `domains-read`，写入使用 `policy-write`，
也可授予 `access-audit:read` / `access-audit:write`。表和查询独立于现有 usage 数据。

## 本地验证

- PostgreSQL 17 隔离库：正式迁移、默认关闭、指定用户过滤、并发重试、绝对字节去重、
  关闭/重新开启、查询/排行、过期清理、用户删除级联、节点计费流量隔离通过。
- Nest 模块与 Guards 实际启动、独立 API scope 回归通过。
- Backend 与 Contract 构建、Frontend 类型检查及生产构建通过。
- Agent 全量 `go test -race ./...`、`go vet ./...` 通过。
- 真实已修补 sing-box 1.14 本地 TLS 测试：域名、指定用户及关闭上传/下载计量通过，
  未开启测试用户无记录，错误 API 密钥被拒绝；没有访问外部网站。
- Chromium 模拟 API 浏览器回归：1280、390、320 px，默认关闭、开启确认、停止、
  大整数显示、安全文本渲染、域名/日期筛选、快捷栏、全局入口通过。
- Frontend 既有日期快捷栏与上传/下载展示回归通过；新增 GitHub x64 回归工作流。

## 发布与线上验收

所有镜像来自 GitHub Actions；部署使用版本标签加 digest，没有复制本地二进制。

| 组件 | 应用源提交 | 发布版本 / 镜像 digest |
| --- | --- | --- |
| Frontend | `d0d8f21722c7cd942788d0c75588ed889ec8d696` | `3.17.0`，打包进 Backend 镜像 |
| Backend | `9559c25a888575a55bba8a6375b16e809eac9dc0` | `3.18.0-anytls` / `sha256:0c957a1d3fbde237bc3e670fea46eccfd69e95d1b84aac56c3ca1031c768117b` |
| Agent | `69f296b38d25336010032c29a7543e0db266eb90` | `3.16.0` / `sha256:09571733493e4b6b216b4e2916ee9da5dd1128cbc60a2605ac5a61348e3c76e6` |

GitHub 成功运行：

- [Frontend 审计浏览器回归](https://github.com/wuansg/frontend/actions/runs/38061656679)
- [Frontend 日期选择器回归](https://github.com/wuansg/frontend/actions/runs/38061656722)
- [Backend PostgreSQL / 权限 / 采集回归](https://github.com/wuansg/backend/actions/runs/38061932783)
- [Backend 原有节点计费回归](https://github.com/wuansg/backend/actions/runs/38061932795)
- [Contract 3.18.0-anytls.0 发布](https://github.com/wuansg/backend/actions/runs/38061932788)
- [Backend 正式镜像](https://github.com/wuansg/backend/actions/runs/38062033210)
- [Agent 测试与正式镜像](https://github.com/wuansg/remnawave-node-go/actions/runs/38061662178)

面板部署于 HostDZire SG。升级前备份：
`/opt/remnawave/backups/release-3.18.0-20261010/`，包含 PostgreSQL dump、Compose 与原环境文件。
数据库 dump 已通过 `pg_restore --list` 核验（454 项、约 7.4 MiB），SHA256：
`e48e530f401abf5984884142e2e12703dee49751becc53d96a1f75c828be4b7e`。
加法迁移 `20261010000000_user_access_audit` 已应用；APP_SECRET 和其余环境设置未改变。
公网面板 HTTP 200，未登录审计接口 401，无审计权限但有 users/connections 权限的 Token 返回 403。
正式迁移后首先确认开启用户及记录均为 0，随后才按用户指示开启 ID 19。

仅升级两个 Agent，并同步其面板期望版本 / 镜像标签：

- **aiyun**：`3.16.0`，保留零入站、纯转发模式；1 条转发规则 applied，usage snapshot 无积压。
  默认无用户时已验证不订阅；4 个审计 Agent 接口无 JWT 均为 401。
- **HostDZire SG**：`3.16.0`，保持原 Trojan WS 54320 入站和用户权限；sing-box `1.14.0` 正常运行。
  审计服务仅在 `127.0.0.1:61003`，有秘密认证；政策已同步且只有 1 个开启用户。

这两个节点的 Compose、挂载、网络、环境和启动命令保持不变（仅更新镜像行）。
各自 Agent 回滚备份：`/root/remnanode-backups/access-audit-3.16.0-20261010/`。

真实链路验收使用用户 19，经 SG 正式入站发起 2 个小流量 HTTPS 请求，均 HTTP 200。
审计最终记录 2 条，域名识别、关闭计量及参考上传 `3876` 字节 / 下载 `132143` 字节正确入库，
非 partial；带用户、节点、域名筛选的 records API 和域名排行均 HTTP 200。
SG 投递队列已 ACK 清空：pending 0、dropped 0、lastError 空，原 usage snapshot 无积压。
数据库未发现任何非 19 用户的审计记录；所有其余用户政策关闭。
测试客户端仅监听临时 loopback 端口，25 秒自动停止；没有将用户密码或客户端配置写入文件。
审计 API 验收的临时 Token 用后删除并清理缓存。

上线前即离线的 CloudSilk 未改动；其余原在线节点在灰度后仍在线。

## 后续

其他 Agent 仍为 `3.15.0`，尚未滚动升级，因而不具备此采集能力。
下一轮经用户确认后再升级；DWHK 按既有要求先切走 Nikki final，再更新、恢复。
GitHub 常规只构建 x64；Oracle Japan ARM64 仍需独立版本构建安排，不能部署 x64 镜像。
用户 19 政策保持开启；可从用户详情的“访问审计”关闭，关闭会立即阻止 Backend 写入新记录。
