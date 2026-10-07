# 上传流量统计与查看优化

状态：已发布并部署，线上核验通过；2026-10-07。

## 范围

- 复用现有上传/下载快照及持久化字段，不改计费倍率、配额和采集基线，不回填旧数据。
- 节点统计、用户统计、Host 统计和对应 Usage 明细统一提供总量/上传/下载切换。
- 排行榜在数据库按所选方向排序后截取 Top N，不能只重排按总量截取的结果。
- 汇总与趋势使用整个查询区间的数据，不把 Top N 小计冒充全量；默认区间保持当天。
- 补齐节点、Host 的方向汇总及每日序列；共享 Host 按 node/inbound/hour 去重，防止翻倍。
- 旧记录未区分方向的部分单独提示，不归入上传或下载，不伪造缺失数据。
- 清晰区分用户代理上下行与主机网卡 RX/TX、转发规则 TCP/UDP 流量，不混合口径。
- 不运行节点硬件测试、测速或流量压测；仅本地代码回归、隔离数据回归及只读线上核验。

## 验收

- 默认总量 API 兼容旧调用；合法方向筛选有效，非法值拒绝；空结果/空节点集合不返回 500。
- 上传重、下载重和历史未拆分样例能正确排序；Top N 不影响汇总、日期补零及图表。
- 共享 Host 方向统计与总量均不重复；跨日边界及当天时间范围一致。
- 前端切换方向同步更新排行榜/图表/日均与峰值，展示有含义的空状态与统计口径。
- Backend/Contract 构建与相关统计/快照测试、Frontend 类型和生产构建通过。
- 计划版本 Backend/Frontend `3.16.0`，Contract `3.16.0-anytls.0`；Agent 保持 `3.15.0`。
  使用 GitHub 镜像发布，不更新或重启节点 Agent。

## 验证记录

- 隔离 PostgreSQL 17：UTC、Asia/Tokyo、America/Los_Angeles 三种数据库时区均通过。
- 包含上传排行与总量排行不同、Top 1、共享 Host 两个别名、旧记录未拆分、区间外记录、午夜边界和空日期补零。
- 真实 Repository SQL 与生产 Prisma/Kysely 驱动回归，节点/Host 响应模型通过 Contract 校验。
- 统一使用 UTC timestamp/date 边界，避免 Prisma Date 参数绑定为 timestamptz 后受 session timezone 影响。
- Backend 类型和生产构建、Contract 两种构建、快照及转发写入回归通过；Frontend 类型、生产构建及方向显示纯函数回归通过。
- 本地 Oxlint 在 allocator 原生模块中异常退出（exit 134），未声称 lint 通过；TS 和构建未报错。
- 发布前只读检查：13/13 节点在线，Agent 均为 3.15.0，快照 pending=0、lastError=null，无活动测试任务。

## 发布与线上验收

- Backend 源码：`b0c33301fea464fde9d4794612f59675dccf939b`；Frontend 源码及标签 `3.16.0`：`fac01cace13406397a58ec7ed11627bff4e7164d`。
- [Contract 发布](https://github.com/wuansg/backend/actions/runs/37580927560)、[SQL 回归](https://github.com/wuansg/backend/actions/runs/37580927524)、[Frontend 发布](https://github.com/wuansg/frontend/actions/runs/37581367913)、[Backend 镜像](https://github.com/wuansg/backend/actions/runs/37581419728) 全部成功。
- 面板使用 `ghcr.io/wuansg/backend:3.16.0-anytls@sha256:3f49dcc0aed53c93a19b050e908e6e86cfcd6b8d7913b3e098bcd968f6bc7be2`；镜像标签、amd64 架构、Backend/Frontend commit 标签已核对。
- 更新前备份：面板 `/opt/remnawave/backups/release-3.16.0-20261007/`，数据库备份约 6.5 MiB；原 `.env` 原样保留，APP_SECRET 未修改。
- 面板首页 HTTP 200，未授权统计接口 HTTP 401，容器运行且重启次数 0。
- 2026-10-06 完整日：节点、用户、Host 三组接口各方向的汇总均与数据库相符；Top 1 与 Top 50 汇总一致，排行榜按所选方向降序。
- 当天上传/下载查询正常；单节点/节点组用户 Usage、用户节点/Host Usage、Host 用户 Usage 均通过三个方向的 HTTP 核验；非法方向返回 400。
- 新前端中文文案与统计组件标记存在；未伪造回填旧记录。
- 发布后 13/13 节点在线，Agent 仍为 3.15.0；profile、核心及转发配置哈希未变，快照序号单调增长，pending=0、lastError=null，无活动测试任务。
- 临时只读 API 核验令牌和鉴权缓存已删除；本地隔离 PostgreSQL、运行容器及测试卷已清理。未运行线上节点测速/硬件测试。
