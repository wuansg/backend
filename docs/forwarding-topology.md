# 转发链路拓扑

范围：只读展示 Host 入口 → nft 转发节点/规则 → 核心节点及其最近出口观测。
不修改配置、用户、计费、审计开关；不触发 DNS 查询、探活、测速或节点重启。

实现约束：

- 新增节点区“转发拓扑”入口，桌面和手机均可访问；默认当天 UTC，可用现有左侧日期快捷栏。
- 使用已保存的配置、运行观测、DNS 结果和历史流量。按地址/IP 和端口关联，名称和备注不作为证据。
- 配置关联、DNS 观测关联、多个候选、未知目标、循环、禁用及过期观测分开标记。
  Host 的面板绑定只是逻辑关联，不能在入口地址不匹配时伪装成已确认直达链路。
- 终点为已配置核心入站，不证明特定用户的实际出站路由；节点出口观测需标明时间和来源。
- 节点供应商周期配额、所选区间核心流量、每条转发 TCP/UDP 用量与 Host 入站归因独立展示。
  不生成跨跳“总消耗”，共享 Host 明确标记，删除规则的历史用量不消失；大整数以十进制字符串传输。
- 独立只读 API scope；响应仅显式列出的安全字段，不返回用户、密码、代理 URL、原始配置和私钥。
- 新功能完成后进行关系/循环/歧义/IPv6/协议/过期状态/大整数及真实 SQL 回归、响应校验、权限测试、
  手机/桌面 UI 和类型/构建检查。没有发布授权前不推送、不上线。

计划版本：Backend 3.20.0、Contract 3.20.0-anytls.0、Frontend 3.19.0（包含尚未发布的 Surge 同色修复）。
Agent 无需修改或升级；无需数据库迁移。

## 本地实现与验收

- API：`GET /api/nodes/forwarding/topology?start=YYYY-MM-DD&end=YYYY-MM-DD`，
  scope `nodes:get-forwarding-topology`（也遵循既有 `nodes:read`/管理员授权）。最多 366 个 UTC 日期。
- 使用一致性数据库快照读取，不调用 Agent、查询 DNS 或触发任务；显式选择安全字段。
  原始入站、用户信息、密码、代理 URL、证书与私钥均不出现在响应中。
- 前端位于“节点 → 转发拓扑”，支持 Host/规则入口选择、节点筛选、30 秒只读刷新、当天默认范围和日期快捷栏。
  手机按纵向展开链路，桌面局部横向浏览；节点/规则明细和已删除规则的历史用量另外保留。
- 地址/IP 与近期接口地址观测用于关联；只采用与当前规则配置 hash 相符的 DNS 结果。
  旧 hash 的 DNS 不套用到新目标。相同地址的多个节点全部列为候选，不按备注或供应商名称推测。
- 每个入口最多展开 16 条候选、12 跳，另设计算预算；循环、未知目标、配置端口/传输或 Host 绑定不一致明确提示。
- 流量以原始整数十进制字符串传输，区间与周期配额不混算；显示上传、下载、总量、未拆分旧数据及共享归因。
  规则级用量是该规则的全部经过字节，不声称是某一个 Host 或用户的独占流量。

通过的回归：

- Backend `test:forwarding-topology`：配置/IP/DNS/IPv6、过期观测与 hash 漂移、歧义、离线/禁用、
  无效配置、删除规则、大整数、共享归因、日期验证及独立 Scope。
- 全部 149 条既有迁移在临时 PostgreSQL 17 应用成功；真实 SQL 在 UTC、Asia/Tokyo、
  America/Los_Angeles 三种会话时区验证午夜与结束日边界、独立统计、共享标记及删除规则历史；读取不改变配额。
- 前端路径逻辑验证多跳/直连、未知入口/目标、循环、禁用、传输与绑定不一致、多个候选及分支上限。
- 真实 Chromium：1280/768/390/320px、深浅色、中英文、长名称/转义文本、大整数与共享提示、
  Host/规则及节点筛选、日期快捷栏、循环/空态/错误态；请求全部为 GET。
- 既有用户流量跳转、Surge 同色图标、日期快捷栏（现 17 个入口）、上传/下载显示及节点编辑回归通过。
- Backend/Frontend 类型检查及生产构建通过，修改范围格式检查通过；新测试接入现有 x64 Actions。
- Contract 前后端两种产物构建通过，前端 wire adapter 与正式 Contract 的 JSON Schema 逐字段一致。
  既有审计及节点发布隔离 PostgreSQL 回归通过。临时数据库、浏览器与测试容器均已回收。

本机最后一轮并行构建曾被资源限制中止；关闭临时 Vite 并回收测试环境后，限制 Node 堆空间串行重跑，
Frontend 类型检查及生产构建成功。不是线上故障，也没有调整生产资源或发布版本来绕过检查。

以上为实施阶段的本地验收；实施时没有推送、构建 GitHub 镜像或部署。

## 发布授权（2026-10-17）

用户明确授权部署。发布 Frontend 3.19.0（包含 Surge 同色修复）、Backend 3.20.0-anytls
及 Contract 3.20.0-anytls.0；等待 GitHub 回归和 amd64 镜像成功后，备份 HostDZire SG
面板数据库、Compose、环境和节点基线，再以版本标签附固定 digest 更新面板。
本次没有数据库迁移，不升级 Agent，不更改节点配置、用户授权、审计策略、APP_SECRET 或统计口径。
实际镜像、提交、Actions 和线上验收结果完成后另行记录。

## 已发布与线上验收（2026-10-17）

北京时间 20:22 完成 HostDZire SG 面板切换，20:23 完成线上验收。

- Backend：`3.20.0-anytls`，源码提交 `b337a694d1e9349ee5a789af039085d849a9c767`。
- Frontend：`3.19.0`，源码提交 `4de8d0e3555de300ea36eed81edab4d75a7792e3`，版本 tag 已推送。
- Contract：`3.20.0-anytls.0`，GitHub 产物发布成功。
- 实际部署镜像（amd64，OCI 版本及前后端提交均核对一致）：
  `ghcr.io/wuansg/backend:3.20.0-anytls@sha256:c91ddf9fc642e0752b625bdb50034e82c42eee78981a52c665852b3e61b9979e`。
- GitHub 全部成功：
  [Backend 回归](https://github.com/wuansg/backend/actions/runs/39031748934)、
  [Contract 发布](https://github.com/wuansg/backend/actions/runs/39031748993)、
  [Frontend UI 回归](https://github.com/wuansg/frontend/actions/runs/39031745614)、
  [日期快捷栏回归](https://github.com/wuansg/frontend/actions/runs/39031745581)、
  [Frontend 发布](https://github.com/wuansg/frontend/actions/runs/39031745962)、
  [amd64 镜像构建](https://github.com/wuansg/backend/actions/runs/39031765640)。

升级前的私有备份位于面板主机 `/opt/remnawave/backups/release-3.20.0-20261017`，
包含数据库、Compose、环境、容器信息与校验基线；旧镜像及此前备份保留。
数据库备份约 25 MiB，`pg_restore --list` 成功（499 行），SHA-256：
`814ef602798887596f539c73d2dd0360726fb9ee17eeb2b16aadf167e7bc45b4`。
环境和基线只在私有备份中保存，未输出敏感内容。

线上验收结果：

- 仅重建 `remnawave`；其他容器 ID、环境文件和 APP_SECRET 不变。
  新容器 healthy，API / jobs / scheduler 均 online、重启次数 0。
- 节点 13 个，原在线 12 个全部在线；CloudSilk 仍为流量耗尽停机状态，本次未处理。
  原在线节点的核心/转发、审计及流量同步均正常，无待应用快照或序列缺口。
- 节点配置、Agent/核心版本、快照 generation、用户审计策略、Host 与 profile 均与升级前一致；
  配额计数没有回退，审计启用用户仍为 10 个，新增数据库迁移 0。
- 新 API 默认当天 UTC、指定日期均返回 200；13 个节点、39 个 Host、9 条规则、0 条孤立历史规则。
  昨日的核心、转发、Host 上传/下载/总量与独立 SQL 汇总一致，共享归因一致；配额独立验证。
- 未认证 401、不相关权限及只读令牌写入 403，无效/超限日期 400；响应无敏感配置字段。
  所有临时验证令牌已清理，数据库和缓存均无遗留验证授权。
- 公网首页与拓扑路由均为 200，返回新构建入口；公网 JavaScript 与镜像中资源逐字节一致。
  新拓扑入口、现有用户流量详情跳转及 Surge `currentColor` 同色图标均在实际产物中。
- 当前 34 个 Host 的入口无法凭已有数据唯一确定，UI 按未知/候选展示，不使用 Host 绑定伪造链路。
  当前规则目标没有多节点歧义。这是已有地址观测的覆盖限制，不会为完善图形而额外查询 DNS 或改配置。

回退范围为上一个固定 digest 的面板镜像与原 Compose；本次没有迁移，不自动回滚数据库。
Agent 无需升级，未重启节点或改动 DWHK/Nikki 分组。
